import express from "express";
import { authorizeRoles, isAuthenticated } from "../middleware/auth";
import { getCoursesAnalytics, getOrderAnalytics, getUserAnalytics } from "../controllers/analytics.controller";

const analyticRouter = express.Router();

analyticRouter.get("/get-users-analytics", isAuthenticated, authorizeRoles("admin"), getUserAnalytics);

analyticRouter.get("/get-orders-analytics", isAuthenticated, authorizeRoles("admin"), getOrderAnalytics);

analyticRouter.get("/get-courses-analytics", isAuthenticated, authorizeRoles("admin"), getCoursesAnalytics);


export default analyticRouter;