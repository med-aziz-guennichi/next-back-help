import { NextFunction, Request, Response } from "express";
import { CatchAsyncErrors } from "../middleware/catchAsyncErrors";
import ErrorHandler from "../utils/ErrorHandler";
import cloudinary from 'cloudinary';
import { createCourse, getAllCoursesService } from "../services/course.service";
import CourseModel from "../models/course.model";
import { redis } from "../utils/redis";
import mongoose from "mongoose";
import path from "path";
import ejs from 'ejs';
import sendMail from "../utils/sendMail";
import NotificationModel from "../models/notification.model";


// upload course
export const uploadCourse = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body;
        const thumbail = data.thumbnail;
        if (thumbail) {
            const myCloud = await cloudinary.v2.uploader.upload(thumbail, {
                folder: "courses",
            });
            data.thumbnail = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url
            };
        }
        createCourse(data,res,next);
    } catch (error:any) {
        return next(new ErrorHandler(error.message, 500));
    }
})

// edit course
export const editCourse = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const data = req.body;
        const thumbnail = data.thumbnail;
        if (thumbnail) {
            await cloudinary.v2.uploader.destroy(thumbnail.public_id);
            const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
                folder: "courses",
            });
            data.thumbnail = {
                public_id: myCloud.public_id,
                url: myCloud.secure_url
            }
        }
        const courseId = req.params.id;

        const course = await CourseModel.findByIdAndUpdate(courseId,
            {
                $set: data,
            },
            {
                new: true
            }
        );
        res.status(200).json({
            success: true,
            course
        })
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// get single course --- without purchasing
export const getSingleCourse = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {

        const courseId = req.params.id;
        const isCacheExist = await redis.get(courseId);
        if (isCacheExist) {
            const course = JSON.parse(isCacheExist);
             res.status(200).json({
                success: true,
                course
            });
        }else{
            const course = await CourseModel.findById(req.params.id).select("-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links");
            await redis.set(courseId, JSON.stringify(course), 'EX', 604800); // 1 week
            res.status(200).json({
                success: true,
                course
            });
        }

        
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));   
    }
});

// get all courses --- without purchasing
export const getAllCourses = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const isCasheExist = await redis.get("allCourses");
        if (isCasheExist) {
            const courses = JSON.parse(isCasheExist);
            res.status(200).json({
                success: true,
                courses
            })
        } else {
            const courses = await CourseModel.find().select("-courseData.videoUrl -courseData.suggestion -courseData.questions -courseData.links");
            await redis.set("allCourses", JSON.stringify(courses));
            res.status(200).json({
                success: true,
                courses
            });
        }
        
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// get course content --- only for valid user
export const getCourseByUser = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userCourseList = req.user?.courses;
        const courseId = req.params.id;

        const courseExist = userCourseList?.find((course: any) => course._id.toString() === courseId);
        if (!courseExist) {
            return next(new ErrorHandler("You are not authorized to access this resource", 403));
        }
        const course = await CourseModel.findById(courseId);
        const content = course?.courseData;
        
        res.status(200).json({
            success: true,
            content
        })
        
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// add question in course
interface IAddQuestionData{
    question: string;
    courseId: string;
    contentId: string;
}
export const addQuestion = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { question, courseId, contentId }: IAddQuestionData = req.body;
        const course = await CourseModel.findById(courseId);

        if (!mongoose.Types.ObjectId.isValid(contentId)) {
            return next(new ErrorHandler("Invalid content id", 400));
        }
        const courseContent = course?.courseData?.find((item: any) => item._id.equals(contentId));
        if (!courseContent) {
            return next(new ErrorHandler("Invalid content id", 400));
        }
        // create a new question object
        const newQuestion: any = {
            user: req.user,
            question,
            questionReplies: [],
        };
        // add this question to our course content
        courseContent.questions.push(newQuestion);

        await NotificationModel.create({
            user: req.user?._id,
            title: "New Question",
            message: `You have a new question in ${courseContent?.title}`,
        });
        // save the updated course
        await course?.save();
        res.status(200).json({
            success: true,
            course
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// add answer in question
interface IAddAnswerData {
    answer: string;
    courseId: string;
    contentId: string;
    questionId: string;
}
export const addAnswer = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { answer, courseId, contentId, questionId }: IAddAnswerData = req.body;

        const course = await CourseModel.findById(courseId);

        if (!mongoose.Types.ObjectId.isValid(contentId)) {
            return next(new ErrorHandler("Invalid content id", 400));
        }
        const courseContent = course?.courseData?.find((item: any) => item._id.equals(contentId));
        if (!courseContent) {
            return next(new ErrorHandler("Invalid content id", 400));
        }
        const question = courseContent?.questions?.find((item: any) => item._id.equals(questionId));
        if (!question) {
            return next(new ErrorHandler("Invalid question id", 400));
        }
        // create a new answer object
        const newAnswer: any = {
            user: req.user,
            answer,
        };
        // add this answer to our question
        question.questionReplies.push(newAnswer);

        await course?.save();

        if (req.user?._id === question.user._id) {
            // create a notification
            await NotificationModel.create({
                user: req.user?._id,
                title: "New Question Reply received",
                message: `You have a new question reply in ${courseContent?.title}`,
            })
        } else {
            const data = {
                name: question.user.name,
                title: courseContent.title
            }
            const html = await ejs.renderFile(path.join(__dirname, "../mails/question-reply.ejs"), data);
            try {
                await sendMail({
                    email: question.user.email,
                    subject: "Question Reply",
                    template: "question-reply.ejs",
                    data
                });
            } catch (error:any) {
                return next(new ErrorHandler(error.message, 500));
            }
        }
        res.status(200).json({
            success: true,
            course
        })
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// add review in course
interface IAddReviewData{
    review: string;
    rating: number;
    userId: string;
}

export const addReview = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userCourseList = req.user?.courses;

        const courseId = req.params.id;

        // check if the courseId already exists in userCourseList based on _id
        const courseExist = userCourseList?.some((course: any) => course._id.toString() === courseId.toString());

        if (!courseExist) {
            return next(new ErrorHandler("You are not authorized to access this resource", 403));
        }
        const course = await CourseModel.findById(courseId);
        const { review, rating } = req.body as IAddReviewData;
        const reviewData: any = {
            user: req.user,
            commment: review,
            rating
        };
        course?.reviews.push(reviewData);

        let avg = 0;
        course?.reviews.forEach((rev: any) => {
            avg += rev.rating;
        });
        if (course) {
            course.ratings = avg / course.reviews.length; // calculate the average
        }
        await course?.save();

        // const notification = {
        //     title: "New Review Received",
        //     message: `${req.user?.name} has given a review in ${course?.name}`
        // }
        // create a notification
        await NotificationModel.create({
            user: req.user?._id,
            title: "New Review Received",
            message: `${req.user?.name} has given a review in ${course?.name}`,
        })
        
        res.status(200).json({
            success: true,
            course
        })
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// add reply in review
interface IAddReviewData{
    comment: string;
    courseId: string;
    reviewId: string;
}
export const addReplyToReview = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { comment, courseId, reviewId }: IAddReviewData = req.body;
        const course = await CourseModel.findById(courseId);
        if (!course) {
            return next(new ErrorHandler("Invalid course id", 400));
        }
        const review = course?.reviews?.find((rev: any) => rev._id.toString() === reviewId);
        if (!review) {
            return next(new ErrorHandler("Invalid review id", 400));
        }
        const replyData: any = {
            user: req.user,
            comment
        };
        if (!review.commentReplies) {
            review.commentReplies = [];
        }
        review.commentReplies?.push(replyData);
        await review?.save();
        await course?.save();

        res.status(200).json({
            success: true,
            course
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// get all courses --- only for admin
export const getAllCoursesAdmin = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        getAllCoursesService(res);
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});

// Delete course --- only for admin
export const deleteCourse = CatchAsyncErrors(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.body;
        const course = await CourseModel.findById(id);
        if (!course) {
            return next(new ErrorHandler("Course not found", 404));
        }
        await course.deleteOne();
        await redis.del(id);

        res.status(200).json({
            success: true,
            message: "Course deleted successfully"
        });
    } catch (error: any) {
        return next(new ErrorHandler(error.message, 500));
    }
});