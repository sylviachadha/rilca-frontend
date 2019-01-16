const express = require('express');
const router = express.Router();
const pool = require('../core/sql/driver');
const uniqid = require('uniqid');
const moment = require('moment');

/* Get all staffs */
router.get('/', async (req, res) => {

    await setNamesInForm();
    res.render('form', {names: names});

});

module.exports = router;
