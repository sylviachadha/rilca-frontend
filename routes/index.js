const express = require('express');
const router = express.Router();
const pool = require('../core/sql/driver');
const uniqid = require('uniqid');
const moment = require('moment');


let names = [];

/* GET home page. */
router.get('/', async (req, res) => {

    await setNamesInForm();
    res.render('form', {names: names});

});

router.post('/form', async (req, res) => {

    console.log(JSON.stringify(req.body));

    const docID = uniqid('rilca-');

    await insertDocument(req.body, docID);

    await insertLine(req.body, docID);

    res.render('form', {names: names});

});


async function setNamesInForm() {
    names = [];
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("SELECT Fname,Lname,Staff_ID  FROM RILCA.STAFF INNER JOIN RILCA.ACADEMIC_STAFF WHERE RILCA.STAFF.STAFF_ID = RILCA.ACADEMIC_STAFF.Ac_ID");
        for (let row of rows) {
            names.push({"FirstName": row.Fname, "LastName": row.Lname, "ID": row.Staff_ID})
        }
    } catch (err) {
        throw err;
    } finally {
        if (conn) return conn.end();
    }
}

async function insertDocument(req, docID) {
    if (req.staffID) {
        const json = {};
        json.docYear = moment().year();
        json.docID = docID;
        json.docStatus = 'Submitted';
        json.date = new Date().toLocaleString();
        json.academicStaffId = req.staffID;

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.query("INSERT INTO PA_DOCUMENT(Doc_ID,Doc_year,Doc_Status,Set_date,Acad_ID) values (?,?,?,?,?) ", [json.docID, json.docYear, json.docStatus, json.date, json.academicStaffId]);
        } catch (err) {
            throw err;
        } finally {
            if (conn) return conn.end();
        }
    }
}


async function insertLine(req, docID) {
    if (req.staffID) {

        let conn;
        try {
            conn = await pool.getConnection();

            Object.keys(req).forEach((key) => {
                let val = req[key];
                let executeQuery = true;
                if ((key === '89' || key === '90') && val === '') {
                    executeQuery = false;
                } else {
                    if (key === '89') val = 15;
                    if (key === '90') val = 5;
                }

                if (key !== 'staffID' && executeQuery) conn.query("INSERT INTO PA_LINE(PAline_Score,PADoc_ID,PAitem_ID,upsert_date) values (?,?,?,?) ", [val, docID, key, new Date().toLocaleString()]);
            });
        } catch (err) {
            throw err;
        } finally {
            if (conn) return conn.end();
        }
    }
}


module.exports = router;
