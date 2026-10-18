import express from "express";
import { listStates, listLgas } from "../controllers/locationController.js";

const route = express.Router();

route.get("/states", listStates);
route.get("/states/:state/lgas", listLgas);

export default route;
