import { Router } from "express";
import {
  create,
  get,
  list,
  updateStatus,
} from "../controllers/ticket.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireActiveUser } from "../middleware/require-active-user.js";

const ticketRouter = Router();

ticketRouter.use(authenticate, requireActiveUser);
ticketRouter.post("/", create);
ticketRouter.get("/", list);
ticketRouter.get("/:ticketId", get);
ticketRouter.patch("/:ticketId/status", updateStatus);

export default ticketRouter;
