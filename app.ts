require("dotenv").config();
import express, { NextFunction, Request, Response } from 'express';
import cors from "cors";
import cookieParser from 'cookie-parser';
import { ErrorMiddleware } from './middleware/error';
import userRouter from './routes/user.route';
import courseRouter from './routes/course.route';
import orderRouter from './routes/order.route';
import notificationRouter from './routes/notification.route';
import analyticRouter from './routes/analytics.route';
import layoutRouter from './routes/layout.route';

export const app = express();


app.use(express.json({ limit: "50mb" }));


app.use(cookieParser());

app.use(cors({
    origin: ['http://localhost:3000'],
    credentials: true
}));

// routes
app.use("/api/v1", userRouter, orderRouter, courseRouter, notificationRouter, analyticRouter, layoutRouter);

// testing api
app.get("/", (req: Request, res: Response, next: NextFunction) => {
    res.send("Hello World");
});

// unknown route
app.all("*", (req: Request, res: Response, next: NextFunction) => {
    const err = new Error(`Route ${req.originalUrl} not found`) as any;
    err.statusCode = 404;
    next(err);
});

app.use(ErrorMiddleware);