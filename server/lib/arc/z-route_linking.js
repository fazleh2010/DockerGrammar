`use strict`;

// TODO pagination of local content, query remote in batches

const fsp = require('fs').promises;
const streamExec = require("./streamexec");
const mstatus = require("./mstatus");
const sparql_utils = require("./sparql_utils")

module.exports = exports = function(app) {

app.get("/link", async (req, res, next) => {
    return res.status(401).send('invalid method, endpoint requires a POST request');
});

function normalize_for_linking(term) {
    if (!term) { return term; }

    return term.toLowerCase().replace(/[\W]/gi, ' ').replace(/\s+/g,' ')
}

function termlist(terms) {
    let terms_by_language = {};

    for (let termidx = 0, termcount = terms.length; termidx < termcount; termidx++) {
        let termobj = terms[termidx];

        let entity = termobj.entity.value;
        let rep = termobj.rep.value;
        if (!rep) {
            continue;
        }
        let lang = termobj.rep["xml:lang"];
        if (!lang) {
            lang = termobj.lang.value.toLowerCase();
            if (lang.indexOf("/") > -1) {
                lang = lang.split("/");
                lang = lang[lang.length - 1];
            }
        }
        rep = normalize_for_linking(rep);

        // console.log("DEBUG-term", entity, lang, rep);
        if (!terms_by_language.hasOwnProperty(lang)) {
            terms_by_language[lang] = [];
        }

        terms_by_language[lang].push({"iri": entity, "rep": rep});
    }

    return terms_by_language;
}

async function isqlExecute(filename) {
    if (!filename) {
        throw Error("isql: no filename to execute")
    }

	const cmdExec = "isql-v";
	const cmdArgs = ["1111", "dba", "dba", "VERBOSE=OFF", filename];
	const execOptions = {cwd: "/tmp"}; //, stdout: process.stderr, stderr: process.stderr};
	mstatus.logstatus("starting isqlExecute");
	var result = null;

	try { 
		result = await streamExec("isql", cmdExec, cmdArgs, execOptions);
		if (result.code != 0) {
			const resulterror = Error("exit code != 0");
            resulterror.result = result;
            throw resulterror;
		}
		mstatus.logstatus("isql exit code " + result.code);
        return result;
	} catch (errconv) {
		mstatus.logstatus("isql error:", errconv.message, errconv);
        throw errconv;
	}
}

const default_graph = "http://tbx2rdf.lider-project.eu/"; 

async function insert_match(local_term, remote_term) {

    const sparql_insert = `SPARQL INSERT DATA {
GRAPH <http://tbx2rdf.lider-project.eu/> {
<${local_term.iri}> <http://www.w3.org/ns/lemon/ontolex#sameAs> <${remote_term.iri}>
} };
`

    const insert_file = "/tmp/server/uploads/insert.db";
    await fsp.writeFile(insert_file, sparql_insert);

    console.log("insert statement", !!sparql_insert);
    const insert_result = await isqlExecute(insert_file);
    console.log("insert result", !!insert_result);
}

async function perform_matching(local_terms, remote_terms) {
    console.log("performing matching");
    console.log("\tlocal languages:", Object.keys(local_terms).length);
    console.log("\tremote languages:", Object.keys(remote_terms).length);

    let total_matches = 0;

	                //console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        //console.log("local_term: ",local_terms);
                        //console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        //console.log("remote_term: ",remote_terms);
                        //console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");

    for (let [local_lang, local_lang_terms] of Object.entries(local_terms)) {
        for (let [remote_lang, remote_lang_terms] of Object.entries(remote_terms)) {
            if (local_lang !== remote_lang) {
                continue;
            }
            console.log("[matching] language:", local_lang, "local terms:", local_lang_terms.length, "remote terms:", remote_lang_terms.length);

            const local_termcount = local_lang_terms.length;
            const remote_termcount = remote_lang_terms.length;

            for (let local_i = 0; local_i < local_termcount; local_i++) {
                for (let remote_i = 0; remote_i < remote_termcount; remote_i++) {
                    let local_term = local_lang_terms[local_i];
                    let remote_term = remote_lang_terms[remote_i];
			//console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
			//console.log("local_term: ",local_term);
                        //console.log("remote_term: ",remote_term);
		        //console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                    if (normalize_for_linking(local_term.rep) === normalize_for_linking(remote_term.rep)) {
			  console.log("local_term: ",local_term);
                          console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                          console.log("remote_term: ",remote_term);
                        if (local_term.iri !== remote_term.iri) {
		            console.log("local_term_uri ",local_term.iri);
		            console.log("remoterm_uri ",remote_term.iri);
                            await insert_match(local_term, remote_term);
                            total_matches++;
                            mstatus.update("linking", {
                                "local_terms": !!local_terms,
                                "remote_terms": !!remote_terms,
                                "status": "matching",
                                "local_term_count": local_termcount,
                                "local_term_current": local_i,
                                "matches": total_matches
                            });

                        }
                        
                    }
                }
            }

        }
    }
}

async function dolinking(req, res, next) {
	
	try {
        let linking_results = {};
        linking_results.action = 'link';
        linking_results.error = null;
            
        mstatus.update("linking", {
            "status": "starting"
        });

        let local_sparql_endpoint = "http://localhost:8890/sparql";
		//console.log("local sparql endpoint:",local_sparql_endpoint);
        let remote_sparql_endpoint = req.body.endpoint || null;
		 // console.log("remote sparql endpoint:",remote_sparql_endpoint);
        if (!remote_sparql_endpoint) {
            linking_results.error = 'endpoint argument missing in request';
        } else {
              
		let local_languages = sparql_utils.sparql_result(await sparql_utils.performSPARQL("SELECT ?language, COUNT(?entry) AS ?entrycount WHERE { ?language rdf:type ontolex:Lexicon .  ?language ontolex:entry ?entry } GROUP BY ?language"));
             //console.log("local_languages:",local_languages);

		let remote_languages = sparql_utils.sparql_result(await sparql_utils.performSPARQL("SELECT ?language, COUNT(?entry) AS ?entrycount WHERE { ?language rdf:type ontolex:Lexicon .  ?language ontolex:entry ?entry } GROUP BY ?language", remote_sparql_endpoint));

		//console.log("remote_languages:",remote_languages);
            linking_results.languages = {
                "local": local_languages,
                "remote": remote_languages
            }
            
            mstatus.update("linking", {
                "status": "matching",
                "languages": linking_results.languages,
                "matches": 0
            });

            const term_query = `PREFIX cc:    <http://creativecommons.org/ns#> 
PREFIX void:  <http://rdfs.org/ns/void#> 
PREFIX skos:  <http://www.w3.org/2004/02/skos/core#> 
PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#> 
PREFIX tbx:   <http://tbx2rdf.lider-project.eu/tbx#> 
PREFIX decomp: <http://www.w3.org/ns/lemon/decomp#> 
PREFIX dct:   <http://purl.org/dc/terms/> 
PREFIX rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> 
PREFIX ontolex: <http://www.w3.org/ns/lemon/ontolex#> 
PREFIX ldr:   <http://purl.oclc.org/NET/ldr/ns#> 
PREFIX odrl:  <http://www.w3.org/ns/odrl/2/> 
PREFIX dcat:  <http://www.w3.org/ns/dcat#> 
PREFIX prov:  <http://www.w3.org/ns/prov#> 

SELECT ?entity ?rep ?lang from <http://tbx2rdf.lider-project.eu/> WHERE { 
    ?entity ontolex:canonicalForm ?canform .
    ?canform ontolex:writtenRep ?rep .
    ?lang rdf:type ontolex:Lexicon .
    ?lang ontolex:entry ?entity .
}`;


            const local_terms = termlist(sparql_utils.sparql_result(await sparql_utils.performSPARQL(term_query)));
            const remote_terms = termlist(sparql_utils.sparql_result(await sparql_utils.performSPARQL(term_query,remote_sparql_endpoint)));

            linking_results.local_terms = local_terms;
            linking_results.remote_terms = remote_terms;


            mstatus.update("linking", {
                "local_terms": !!local_terms,
                "remote_terms": !!remote_terms,
                "languages": linking_results.languages,
                "status": "matching",
                "matches": 0
            });

 //console.log("linking_results.local_terms:",linking_results.local_terms);
 //console.log("linking_results.remote_terms:",linking_results.remote_terms);



            res.redirect("/status.json");
            await perform_matching(local_terms, remote_terms);

            mstatus.update("linking", {
                "status": "complete"
            });
        }
    } catch (e) {
	    console.log("error in status field!!!");
        mstatus.update("linking", {
            "status": "error",
            "error": e
        });

        return next(e);
    }
}

app.post("/link", dolinking);
app.put("/link", dolinking);



}


