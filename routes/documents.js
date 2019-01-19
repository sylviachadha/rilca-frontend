const express = require('express');
const router = express.Router();
const pool = require('../core/sql/driver');
const uniqid = require('uniqid');
const moment = require('moment');

/**
 * URL:
 * prefix url                  : /documents
 * show all pa documents       : [get] /
 * show a detail docuemt       : [get] /view_pa_doc?doc_ID=xxx
 * open form                   : [get] /new_document
 * submit form                 : [post] /new_document
 * delete a pa item in a doc   : [post] /delete_item?doc_ID=xxx&item_ID=xxx
 */

let names = [];

//get all pa documents
router.get('/', async (req, res) => {
    console.log(">>>>>>>>>>Get all PA documents<<<<<<<<");

    documents = [];
    const dateformat = require('dateformat');
    let conn;
    try {
        conn = await pool.getConnection();
        const rows = await conn.query("select * from v_get_document order by Set_date desc");
        for (let row of rows) {
            documents.push({
                "Staff_ID": row.Staff_ID, 
                "Full_Name": row.Full_Name, 
                "Title": row.Title,
                "Set_date": dateformat(row.Set_date, 'dddd, mmmm dS, yyyy'),
                "Number_of_Items": row.Number_of_Items,
                "Approve_Status": row.Approve_Status,
                "Accept_Status": row.Accept_Status,
                "Doc_ID": row.Doc_ID
            })
        }
        
        res.render('pa_documents', {documents: documents});
    } catch (err) {
        throw err;
    } finally {
        if (conn) return conn.end();
    }
    
});

//get a specific pa document
router.get('/view_pa_doc', async (req, res) => {
    var doc_ID = req.param('doc_ID');
    
    console.log(">>>>>>>>>>Get a PA document detail<<<<<<<<");
    console.log("- PA document ID: " + doc_ID);

    document = [];
    paLineStandardSection = [];
    paLineDevelopmentSection = [];

    let conn;
    try {
        conn = await pool.getConnection();
        //get a specific document
        const rowsDoc = await conn.query("select * from v_get_document where doc_ID = '" + doc_ID + "'");
        for (let row of rowsDoc) {
            document.push({
                "Staff_ID": row.Staff_ID, 
                "Full_Name": row.Full_Name, 
                "Title": row.Title,
                "Set_date": row.Set_date,
                "Number_of_Items": row.Number_of_Items,
                "Approve_Status": row.Approve_Status,
                "Accept_Status": row.Accept_Status,
                "Doc_ID": row.Doc_ID,
                "Doc_year": row.Doc_year
            })
        }

        //get all pa lines related to pa doucment above (Standard Section)
        var rowsLine = await conn.query("select pa_item.Item_ID, pa_item.Parent_id, pa_item.G_Desc_eng, pa_item.G_Desc_thai, pa_line.PAline_Score " +
            "from pa_line inner join pa_item on pa_line.PAItem_ID = pa_item.Item_ID where PADoc_ID = '" + 
            doc_ID + "' AND pa_line.PAItem_ID BETWEEN 1 AND 90");
        for (let row of rowsLine) {
            paLineStandardSection.push({
                "Item_ID":row.Item_ID,
                "Parent_id":row.Parent_id,
                "G_Desc_eng":row.G_Desc_eng,
                "G_Desc_thai":row.G_Desc_thai,
                "PAline_Score":row.PAline_Score,
            })
        }

        //get all pa lines related to pa doucment above (Development Section)
        rowsLine = await conn.query("select pa_item.Item_ID, pa_item.Parent_id, pa_item.G_Desc_eng, pa_item.G_Desc_thai, pa_line.PAline_Score " + 
            "from pa_line inner join pa_item on pa_line.PAItem_ID = pa_item.Item_ID where PADoc_ID = '"+ 
            doc_ID +"' AND pa_line.PAItem_ID BETWEEN 91 AND 200");
        for (let row of rowsLine) {
            paLineDevelopmentSection.push({
                "Item_ID":row.Item_ID,
                "Parent_id":row.Parent_id,
                "G_Desc_eng":row.G_Desc_eng,
                "G_Desc_thai":row.G_Desc_thai,
                "PAline_Score":row.PAline_Score,
            })
        }

        //Call calculate score function to calculate score of the document
        var finalscore = await calculateScore(doc_ID);
        
        res.render('pa_document_detail', {document: document, paLinesSS:paLineStandardSection, 
            paLinesDS:paLineDevelopmentSection, finalscore: finalscore[0]});
    } catch (err) {
        console.log(err)
        throw err;
    } finally {
        if (conn) return conn.end();
    }
});

//get full description of a pa item
async function getFullPAItemDesc(language, itemID){
    console.log("Get full description: " + language + itemID)
    var result="";
    let conn;
    try {
        conn = await pool.getConnection();
        var sql = "WITH recursive EXPL AS " +
        "( " +
        "SELECT root.Item_ID, root.Parent_id, root.G_Desc_eng, root.G_Desc_thai " +
        "FROM pa_item as root " +
        "WHERE root.Item_ID = '"+ itemID +"' " +
        "UNION ALL " +
        "SELECT child.Item_ID, child.Parent_id, child.G_Desc_eng, child.G_Desc_thai " +
        "FROM EXPL as parent JOIN pa_item as child ON parent.Parent_id = child.Item_ID " +
        "AND child.Item_ID <> child.Parent_id " +
        ") " +
        "SELECT * FROM EXPL"
        const rows = await conn.query(sql);
        console.log("rows: " + rows);
        for (let row of rows) {
            if (language == "English") result += row.G_Desc_eng;
            else result += row.G_Desc_thai;
        }
        return(result);
    } catch (err) {
        console.log(err)
        throw err;
    } finally {
        if (conn) return conn.end();
    }
}

//open pa item form
router.get('/new_document', async (req, res) => {

    await setNamesInForm();
    res.render('form', {names: names});

});

//submit form (create document + store pa lines)
router.post('/new_document', async (req, res) => {

    console.log(JSON.stringify(req.body));

    const docID = uniqid('rilca-');

    await insertDocument(req.body, docID);

    await insertLine(req.body, docID);

    res.render('form', {names: names});

});

//delete a pa item of a specific document
router.post('/delete_item', async (req, res) => {
    var docID = req.param("doc_ID");
    var itemID = req.param("item_ID");

    console.log(">>>>>>>>>Delete PA Item<<<<<<<<<<")
    console.log("- Document ID: " + docID);
    console.log("- PA Item ID: " + itemID);

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("DELETE FROM pa_line WHERE PADoc_ID = ? AND PAitem_ID = ?", [docID, itemID]);

        res.redirect('/documents/view_pa_doc?doc_ID='+docID);
    } catch (err) {
        throw err;
    } finally {
        if (conn) return conn.end();
    }
});

//update score of a pa item
router.post('/edit_score', async (req, res) => {
    var docID = req.param("doc_ID");
    var itemID = req.param("item_ID");
    var newScore = req.body.newScore;

    console.log(">>>>>>>>>Update PA Item score<<<<<<<<<<")
    console.log("- Document ID: " + docID);
    console.log("- PA Item ID: " + itemID);
    console.log("- New score: " + newScore);

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.query("UPDATE pa_line SET PAline_score = ? WHERE PADoc_ID = ? AND PAitem_ID = ?", [newScore, docID, itemID]);

        res.redirect('/documents/view_pa_doc?doc_ID='+docID);
    } catch (err) {
        throw err;
    } finally {
        if (conn) return conn.end();
    }
});

//Calculate the score of a pa document
async function calculateScore(doc_ID) {

    console.log(">>>>>>>>>>Calculate Score<<<<<<<<<<")

    let conn;
    try {
        conn = await pool.getConnection();
        var sql = "";

        //calculate raw standard section score
        SSScore = 0;
        sql = "SELECT SUM(PAline_Score) as 'Score' FROM pa_line WHERE PADoc_ID = '"+ doc_ID +"' AND PAitem_ID BETWEEN 1 AND 90"
        var rows = await conn.query(sql);
        SSScore = rows[0].Score==null?0:rows[0].Score;
        console.log("- Raw standard section score: " + SSScore)

        //calculate raw development section score
        DSScore = 0;
        sql = "SELECT SUM(PAline_Score) as 'Score' FROM pa_line WHERE PADoc_ID = '"+ doc_ID +"' AND PAitem_ID BETWEEN 91 AND 198"
        rows = await conn.query(sql);
        DSScore = rows[0].Score==null?0:rows[0].Score;
        console.log("- Raw development section score: " + DSScore)

        //calculate score of top five staffs
        var Top5Score = [];
        sql = "SELECT sum(pa_line.PAline_Score) as 'total_score', staff.Staff_ID " +
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

        //calculate average score of top five staff
        Top5Average = 0;
        for (let s of Top5Score){
            Top5Average += s.total_score;
        }
        Top5Average = Top5Average/5;
        console.log("- Average score to top 5 staffs: " + Top5Average)

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
        console.log("- Final Standard Section Score: " + final_ssScore);
        console.log("- Final Development Section Score: " + final_dsScore);

        var result = [];
        result.push({
            "SSScore": SSScore,
            "DSScore": DSScore,
            "Top5Average": Top5Average,
            "final_ssScore": final_ssScore,
            "final_dsScore": final_dsScore
        });
        return result;

    } catch (err) {
        console.log(err)
        throw err;
    } finally {
        if (conn) {
            conn.end();
            return result;
        }
    }
}

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
