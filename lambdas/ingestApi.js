// API Gateway Lambda handler for POST /ingest endpoint to write state records to DynamoDB
exports.handler = async (event) => {
  const body = JSON.parse(event.body);
  console.log('Ingesting state record:', body);
  // TODO: Validate and write to DynamoDB state table
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'State ingested' })
  };
};
