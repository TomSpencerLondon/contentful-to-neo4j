function isArray(arr) {
    return arr instanceof Array;
}

function isPrimitiveNonString(value) {
  return (typeof(value) == "number") || (typeof(value) == "boolean")
}

const processAssets = (neo4jService, assets, skip, limit, currentFetch, nextFetch) => {

    console.log("Assets:", assets.items.length)

    assets.items.forEach( (asset) => {
      neo4jService.cypherCommand(`CREATE (a:asset {cmsid: '${asset.sys.id}', cmstype: '${asset.sys.type}', title: {titleParam}, url: '${asset.fields.file.url}'} ) RETURN a`, {titleParam: asset.fields.title})
    });

    if ((skip + limit) <= assets.total) {
      currentFetch(skip + limit, limit);
    }
    else {
      nextFetch(limit);
    }
  }

  const processEntries = (neo4jService, entries, skip, limit, recordRelationship, currentFetch, processRelationships) => {
    console.log("Entries:", entries.items.length);

    entries.items.forEach( (entry) =>  {

      // Bare entry
      const cmd = `CREATE (a:${entry.sys.contentType.sys.id} {cmsid: '${entry.sys.id}', contenttype: '${entry.sys.contentType.sys.id}', cmstype: '${entry.sys.type}'} ) RETURN a`;
      neo4jService.cypherCommand(cmd);

      // Work on fields and relationships
      const fields = entry.fields;

      Object.keys(fields).forEach( (fieldName) => {

        let fieldValue = fields[fieldName];

        if ( isPrimitiveNonString(fieldValue) ) {
          let cmd = `MATCH (a {cmsid: '${entry.sys.id}'}) SET a.${fieldName} = ${ fieldValue } RETURN a`
          neo4jService.cypherCommand(cmd);
        } else if ( typeof(fieldValue) == "string" ) {
          let cmd = `MATCH (a {cmsid: '${entry.sys.id}'}) SET a.${fieldName} = {valueParam} RETURN a`
          neo4jService.cypherCommand(cmd, {valueParam: fieldValue});
        } else if (isArray(fieldValue)) {
          let collection = [];
          fieldValue.forEach( (v, i) => {
            if (v.sys && v.sys.type) {
              recordRelationship( {id: entry.sys.id, otherId: v.sys.id, relation: fieldName, order: i  } )
            } else {
              collection.push( '"' + v.toString() + '"');
              // This will fail if we ever see an array of primitive types
              //console.log ( fieldName + ' is an array of unhandled type ' + typeof(v))
            }
          });

          if (collection.length > 0) {
            let cmd = `MATCH (a {cmsid: '${entry.sys.id}'}) SET a.${fieldName} = [${ collection.join(",") }] RETURN a`
            dbCommand(cmd);
          }

        } else if (fieldValue.sys && fieldValue.sys.type) {
          recordRelationship( {id: entry.sys.id, otherId: fieldValue.sys.id, relation: fieldName } )
        } else {
          console.log('UNKNOWN FIELD: ' + fieldName + ' ' + typeof(fieldValue) );
        }
      });
    });

    if ((skip + limit) <=  entries.total) {
      currentFetch(skip + limit, limit);
    } else {
      //Call process relationships
      processRelationships(neo4jService);
    }
  }

  let relationships = [];

  const storeRelationship = (data) => {
    relationships.push(data)
  }

  const processRelationships = (neo4jService) => {
    console.log("We found " +  relationships.length + " relationships")

    relationships.forEach( relationship => {
      if (relationship.order) {
        let cmd1 = `MATCH (a {cmsid: '${relationship.id}'}), (b {cmsid: '${relationship.otherId}'} ) CREATE (a) -[r:${relationship.relation} {order: ${relationship.order}} ]-> (b)`;
        neo4jService.cypherCommand(cmd1);
      } else {
        let cmd = `MATCH (a {cmsid: '${relationship.id}'}), (b {cmsid: '${relationship.otherId}'} ) CREATE (a) -[r:${relationship.relation}]-> (b)`;
        neo4jService.cypherCommand(cmd);
      }
    });

    neo4jService.finish();
  }

export { processAssets, processEntries, storeRelationship, processRelationships }


