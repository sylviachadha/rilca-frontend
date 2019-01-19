const express = require('express');
const router = express.Router();
const pool = require('../core/sql/driver');
const uniqid = require('uniqid');
const moment = require('moment');

/* Get all pa items */
router.get('/', async (req, res) => {

    res.render('home');

});

module.exports = router;
