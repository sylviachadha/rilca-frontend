const express = require('express');
const router = express.Router();
const pool = require('../core/sql/driver');
const uniqid = require('uniqid');
const moment = require('moment');


let names = [];

//get all pa documents
router.get('/', async (req, res) => {
    documents = [];
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("select * from v_get_document");
        for (let row of rows) {
            documents.push({
                "Staff_ID": row.Staff_ID, 
                "Full_Name": row.Full_Name, 
                "Title": row.Title,
                "Set_date": row.Set_date,
                "Number_of_Items": row.Number_of_Items,
                "Approve_Status": row.Approve_Status,
                "Accept_Status": row.Accept_Status,
                "Doc_ID": row.Doc_ID
            })
        }
        console.log(documents);
        res.render('pa_documents', {documents: documents});
    } catch (err) {
        throw err;
    } finally {
        if (conn) return conn.end();
    }
    
});

//get a specific pa document via document ID
router.get('/view_pa_doc', async (req, res) => {
    var doc_ID = req.param('doc_ID');
    console.log(doc_ID);

    document = [];
    paLines = [];

    let conn;
    try {
        conn = await pool.getConnection();
        //get a specific document
        const rowsDoc = await conn.query("select * from pa_document where doc_ID = '" + doc_ID + "'");
        for (let row of rowsDoc) {
            document.push({
                "Doc_ID":row.Doc_ID,
                "Doc_year":row.Doc_year,
                "Doc_Status":row.Doc_Status,
                "DirSign_Date":row.DirSign_Date,
                "DDirSign_Date":row.DDirSign_Date,
                "Approve_Date":row.Approve_Date,
                "Set_date":row.Set_date,
                "Accept_date":row.Accept_date,
                "SignDir_ID":row.SignDir_ID,
                "SignDDir_ID":row.SignDDir_ID,
                "PAExec_ID":row.PAExec_ID,
                "Acad_ID":row.PAExec_ID
            })
        }
        console.log(document);

        //get all pa lines related to pa doucment above
        const rowsLine = await conn.query("select pa_item.Item_ID, pa_item.G_Desc_eng, pa_item.G_Desc_thai, pa_line.PAline_Score from pa_line inner join pa_item on pa_line.PAItem_ID = pa_item.Item_ID where PADoc_ID = '"+ doc_ID +"'");
        for (let row of rowsLine) {
            paLines.push({
                "Item_ID":row.Item_ID,
                "G_Desc_eng":row.G_Desc_eng,
                "G_Desc_thai":row.G_Desc_thai,
                "PAline_Score":row.PAline_Score
            })
        }
        console.log(paLines);
        
        res.render('pa_document_detail', {document: document, paLines:paLines});
    } catch (err) {
        console.log(err)
        throw err;
    } finally {
        if (conn) return conn.end();
    }
});

/* open form for academic staff for choosing pa items */
router.get('/new_document', async (req, res) => {

    await setNamesInForm();
    res.render('form', {names: names});

});

// submit the choosen pa items
router.post('/new_document', async (req, res) => {

    console.log(JSON.stringify(req.body));

    const docID = uniqid('rilca-');

    await insertDocument(req.body, docID);

    await insertLine(req.body, docID);

    res.render('form', {names: names});

});

router.get('/calculate_score', async (req, res) => {
    var doc_ID = req.param('doc_ID');
    console.log(doc_ID)

    
    let conn;
    try {
        //calculate standard section
        SSScore = 0;
        console.log(SSScore)
        var ssScoreSql = "SELECT SUM(PAline_Score) as 'Score' FROM pa_line WHERE PADoc_ID = '"+ doc_ID +"' AND PAitem_ID BETWEEN 1 AND 90"
        console.log(ssScoreSql)
        conn = await pool.getConnection();
        var rows = await conn.query(ssScoreSql);
        console.log(rows)
        console.log(rows[0].Score)
        SSScore = rows[0].Score
        console.log("SSScore: " + SSScore)

        //calculate development section
        DSScore = 0;
        var dsScoreSql = "SELECT SUM(PAline_Score) as 'Score' FROM pa_line WHERE PADoc_ID = '"+ doc_ID +"' AND PAitem_ID BETWEEN 91 AND 198"
        console.log(dsScoreSql)
        rows = await conn.query(dsScoreSql);
        console.log(rows)
        DSScore = rows[0].Score
        console.log("DSSCore: " + DSScore)

        //calculate score of top five staff
        var Top5Score = [];
        var sql = "SELECT sum(pa_line.PAline_Score) as 'total_score', staff.Staff_ID " +
        "FROM pa_line INNER join pa_document on pa_line.PADoc_ID = pa_document.Doc_ID " +
            "INNER JOIN staff on staff.Staff_ID = pa_document.Acad_ID " +
        "WHERE pa_document.Doc_year = (SELECT pa_document.Doc_year from pa_document WHERE pa_document.Doc_ID = '"+ doc_ID +"') " +
        "AND staff.Program_ID = (SELECT staff.Program_ID from staff INNER JOIN pa_document on staff.staff_id = pa_document.Acad_ID WHERE pa_document.Doc_ID = '"+ doc_ID +"') " +
        "GROUP BY staff.Staff_ID "+
        "ORDER BY total_score DESC "+
        "LIMIT 5"
        rows = await conn.query(sql);
        for (let row of rows) {
            Top5Score.push({"total_score": row.total_score, "Staff_ID": row.Staff_ID})
        }
        console.log(Top5Score)

        //calculate average of top five staff
        Top5Average = 0;
        for (let s of Top5Score){
            Top5Average += s.total_score;
        }
        Top5Average = Top5Average/5;
        console.log(Top5Average)

        //Calculate the final score
        final_ssScore =  0;
        final_dsScore = 0;
        if (SSScore > 60) {
            final_ssScore = 60;
            final_dsScore = (((SSScore - 60) + DSScore)*20)/Top5Average;
        }else{
            final_ssScore = SSScore;
            final_dsScore = (DSScore*20)/Top5Average;
        }
        console.log("Final Standard Section Score: " + final_ssScore);
        console.log("Final Development Section Score: " + final_dsScore);
        
    } catch (err) {
        console.log(err)
        throw err;
    } finally {
        if (conn) return conn.end();
    }
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
