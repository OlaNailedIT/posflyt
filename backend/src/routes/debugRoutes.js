const { nowISOString } = require("../utils/date.js");
const express = require("express");

const router = express.Router();

router.get("/request-id", (req, res) => {
  return res.json({
    requestId: req.requestId,
    time: nowISOString(),
  });
});

module.exports = router;
