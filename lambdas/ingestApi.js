const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.STATE_TABLE || 'StateTable';

/**
 * Lambda handler for API Gateway POST /ingest endpoint.
 * Validates payload and writes items to DynamoDB.
 * Returns proper CORS responses.
 * @param {Object} event - API Gateway event
 * @returns {Object} - HTTP response with CORS headers
 */
async function handler(event) {
    // CORS headers for all responses
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'POST,OPTIONS'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: ''
        };
    }

    // Only allow POST method
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    // Parse and validate request body
    let body;
    try {
        body = JSON.parse(event.body);
    } catch (parseError) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Invalid JSON in request body' })
        };
    }

    // Validate payload has required fields
    const validationError = validatePayload(body);
    if (validationError) {
        return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: validationError })
        };
    }

    // Write to DynamoDB
    try {
        const putCommand = new PutCommand({
            TableName: TABLE_NAME,
            Item: body
        });

        await docClient.send(putCommand);

        return {
            statusCode: 201,
            headers: corsHeaders,
            body: JSON.stringify({ 
                message: 'State ingested successfully',
                itemId: body.id || body.pk 
            })
        };

    } catch (dbError) {
        console.error('DynamoDB write error:', dbError);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Failed to write to database' })
        };
    }
}

/**
 * Validates the incoming payload.
 * @param {Object} payload - The parsed request body
 * @returns {string|null} - Error message if invalid, null if valid
 */
function validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return 'Payload must be a valid object';
    }

    // Check for at least one key attribute (id, pk, or similar)
    const hasKeyAttribute = payload.id || payload.pk || payload.keyId;
    if (!hasKeyAttribute) {
        return 'Payload must include a key attribute (id, pk, or keyId)';
    }

    // Optional: Add more validation rules as needed
    // For example, check specific field types or required fields

    return null;
}

module.exports = {
    handler,
    validatePayload
};
