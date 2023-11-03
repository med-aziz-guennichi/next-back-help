import { NextFunction, Request, Response } from "express";
import ErrorHandler from "../utils/ErrorHandler";

export const ErrorMiddleware = (err:any,request:Request,res:Response,next:NextFunction) => {
    err.statusCode = err.statusCode || 500;
    err.message = err.message || "Internal Server Error";

    // Wrong Mongoose Object ID Error
    if(err.name === "CastError"){
        const message = `Resource not found. Invalid: ${err.path}`;
        err = new ErrorHandler(message,400);
    }

    // Dublicate key error
    if(err.code === 11000){
        const message = `Duplicate ${Object.keys(err.keyValue)} entered`;
        err = new ErrorHandler(message,400);
    }
    // Wrong JWT error
    if(err.name === "JsonWebTokenError"){
        const message = `Json web token is invalid. Please login again!`;
        err = new ErrorHandler(message, 400);
    }
    // Expired JWT error
    if(err.name === "TokenExpiredError"){
        const message = `Access token expried. Please login again!`;
        err = new ErrorHandler(message, 400);
    }
    res.status(err.statusCode).json({
        success: false,
        message: err.message
    });
}
