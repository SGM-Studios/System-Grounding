const { handler, validatePayload } = require('../ingestApi');

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({}))
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
    const mockSend = jest.fn();
    return {
        DynamoDBDocumentClient: {
            from: jest.fn().mockImplementation(() => ({
                send: mockSend
            }))
        },
        PutCommand: jest.fn().mockImplementation((params) => params)
    };
});

// Get the mocked send function for testing
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const mockSend = jest.fn();
DynamoDBDocumentClient.from.mockReturnValue({ send: mockSend });

describe('validatePayload', () => {
    it('should return null for valid payload with id', () => {
        const payload = { id: '123', name: 'Test', status: 'active' };
        expect(validatePayload(payload)).toBeNull();
    });

    it('should return null for valid payload with pk', () => {
        const payload = { pk: '123', data: 'value' };
        expect(validatePayload(payload)).toBeNull();
    });

    it('should return null for valid payload with keyId', () => {
        const payload = { keyId: '123', value: 42 };
        expect(validatePayload(payload)).toBeNull();
    });

    it('should return error for null payload', () => {
        expect(validatePayload(null)).toBe('Payload must be a valid object');
    });

    it('should return error for undefined payload', () => {
        expect(validatePayload(undefined)).toBe('Payload must be a valid object');
    });

    it('should return error for non-object payload', () => {
        expect(validatePayload('string')).toBe('Payload must be a valid object');
        expect(validatePayload(123)).toBe('Payload must be a valid object');
        expect(validatePayload([])).toBe('Payload must be a valid object');
    });

    it('should return error for object without key attribute', () => {
        const payload = { name: 'Test', status: 'active' };
        expect(validatePayload(payload)).toBe('Payload must include a key attribute (id, pk, or keyId)');
    });

    it('should accept empty object with id', () => {
        const payload = { id: '123' };
        expect(validatePayload(payload)).toBeNull();
    });
});

describe('handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSend.mockReset();
    });

    describe('CORS handling', () => {
        it('should handle OPTIONS preflight request', async () => {
            const event = {
                httpMethod: 'OPTIONS',
                body: null
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(200);
            expect(result.headers).toEqual({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            });
            expect(result.body).toBe('');
        });

        it('should include CORS headers in all responses', async () => {
            const event = {
                httpMethod: 'POST',
                body: JSON.stringify({ id: '123', name: 'Test' })
            };

            mockSend.mockResolvedValue({});

            const result = await handler(event);

            expect(result.headers).toEqual({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'POST,OPTIONS'
            });
        });
    });

    describe('HTTP method validation', () => {
        it('should reject GET requests with 405', async () => {
            const event = {
                httpMethod: 'GET',
                body: null
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(405);
            expect(JSON.parse(result.body)).toEqual({ error: 'Method not allowed' });
        });

        it('should reject PUT requests with 405', async () => {
            const event = {
                httpMethod: 'PUT',
                body: JSON.stringify({ id: '123' })
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(405);
        });

        it('should reject DELETE requests with 405', async () => {
            const event = {
                httpMethod: 'DELETE',
                body: null
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(405);
        });
    });

    describe('payload parsing', () => {
        it('should return 400 for invalid JSON', async () => {
            const event = {
                httpMethod: 'POST',
                body: 'not valid json'
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body)).toEqual({ error: 'Invalid JSON in request body' });
        });

        it('should return 400 for empty body', async () => {
            const event = {
                httpMethod: 'POST',
                body: ''
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
        });
    });

    describe('payload validation', () => {
        it('should return 400 for payload without key attribute', async () => {
            const event = {
                httpMethod: 'POST',
                body: JSON.stringify({ name: 'Test', status: 'active' })
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
            expect(JSON.parse(result.body).error).toBe('Payload must include a key attribute (id, pk, or keyId)');
        });

        it('should return 400 for null payload', async () => {
            const event = {
                httpMethod: 'POST',
                body: JSON.stringify(null)
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(400);
        });
    });

    describe('successful writes', () => {
        it('should write valid item to DynamoDB and return 201', async () => {
            const testItem = { id: '123', name: 'Test Item', status: 'active' };
            
            mockSend.mockResolvedValue({});

            const event = {
                httpMethod: 'POST',
                body: JSON.stringify(testItem)
            };

            const result = await handler(event);

            expect(mockSend).toHaveBeenCalledTimes(1);
            expect(result.statusCode).toBe(201);
            expect(JSON.parse(result.body)).toEqual({
                message: 'State ingested successfully',
                itemId: '123'
            });
        });

        it('should use pk as itemId when id is not present', async () => {
            const testItem = { pk: 'my-key', data: 'value' };
            
            mockSend.mockResolvedValue({});

            const event = {
                httpMethod: 'POST',
                body: JSON.stringify(testItem)
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(201);
            expect(JSON.parse(result.body).itemId).toBe('my-key');
        });

        it('should use correct table name from environment variable', async () => {
            process.env.STATE_TABLE = 'CustomStateTable';
            
            mockSend.mockResolvedValue({});

            const event = {
                httpMethod: 'POST',
                body: JSON.stringify({ id: '123' })
            };

            await handler(event);

            // Verify PutCommand was called with correct table name
            const putCommandCall = mockSend.mock.calls[0][0];
            expect(putCommandCall.TableName).toBe('CustomStateTable');

            delete process.env.STATE_TABLE;
        });

        it('should use default table name when env var is not set', async () => {
            delete process.env.STATE_TABLE;
            
            mockSend.mockResolvedValue({});

            const event = {
                httpMethod: 'POST',
                body: JSON.stringify({ id: '123' })
            };

            await handler(event);

            const putCommandCall = mockSend.mock.calls[0][0];
            expect(putCommandCall.TableName).toBe('StateTable');
        });
    });

    describe('error handling', () => {
        it('should return 500 when DynamoDB write fails', async () => {
            mockSend.mockRejectedValue(new Error('DynamoDB connection error'));

            const event = {
                httpMethod: 'POST',
                body: JSON.stringify({ id: '123', name: 'Test' })
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(500);
            expect(JSON.parse(result.body)).toEqual({ error: 'Failed to write to database' });
        });

        it('should include CORS headers even on error', async () => {
            mockSend.mockRejectedValue(new Error('Database error'));

            const event = {
                httpMethod: 'POST',
                body: JSON.stringify({ id: '123' })
            };

            const result = await handler(event);

            expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
            expect(result.headers['Access-Control-Allow-Methods']).toBe('POST,OPTIONS');
        });
    });

    describe('integration scenarios', () => {
        it('should handle complete successful flow with complex payload', async () => {
            const complexItem = {
                id: 'user-123',
                profile: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    preferences: {
                        theme: 'dark',
                        notifications: true
                    }
                },
                tags: ['premium', 'verified'],
                createdAt: 1234567890,
                metadata: {
                    source: 'api',
                    version: '1.0'
                }
            };

            mockSend.mockResolvedValue({});

            const event = {
                httpMethod: 'POST',
                body: JSON.stringify(complexItem)
            };

            const result = await handler(event);

            expect(result.statusCode).toBe(201);
            expect(mockSend).toHaveBeenCalledTimes(1);
            
            const response = JSON.parse(result.body);
            expect(response.message).toBe('State ingested successfully');
            expect(response.itemId).toBe('user-123');
        });

        it('should handle multiple sequential requests', async () => {
            mockSend.mockResolvedValue({});

            const requests = [
                { httpMethod: 'POST', body: JSON.stringify({ id: '1' }) },
                { httpMethod: 'POST', body: JSON.stringify({ id: '2' }) },
                { httpMethod: 'POST', body: JSON.stringify({ id: '3' }) }
            ];

            for (const req of requests) {
                const result = await handler(req);
                expect(result.statusCode).toBe(201);
            }

            expect(mockSend).toHaveBeenCalledTimes(3);
        });
    });
});
