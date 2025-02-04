import { ChromaClient, GetCollectionParams, IEmbeddingFunction } from 'chromadb'
import { 
  ChromaMessage, 
  DEFAULT_CHROMA_CONFIG,
  CHROMA_KEYS
} from '../types/chroma'

describe('ChromaDB Integration', () => {
  let client: ChromaClient
  const testUserId = 'test_user_123'
  const testConversationId = 'test_conv_456'

  // Default collection params
  const defaultParams: GetCollectionParams = {
    name: '',  // Will be set in each test
    embeddingFunction: {
      generate: async (texts: string[]): Promise<number[][]> => 
        texts.map(() => Array(DEFAULT_CHROMA_CONFIG.embeddingDimension).fill(0.1))
    } as IEmbeddingFunction
  }

  beforeAll(async () => {
    // Initialize ChromaDB client with test configuration
    client = new ChromaClient({
      path: `http://${DEFAULT_CHROMA_CONFIG.host}:${DEFAULT_CHROMA_CONFIG.port}`
    })
  })

  afterAll(async () => {
    // Cleanup test collections
    const collections = await client.listCollections()
    for (const collection of collections) {
      await client.deleteCollection({ name: collection })
    }
  })

  describe('Collection Management', () => {
    it('should create a user collection', async () => {
      const collectionName = CHROMA_KEYS.userCollection(testUserId)
      const collection = await client.createCollection({
        ...defaultParams,
        name: collectionName
      })
      expect(collection.name).toBe(collectionName)
    })

    it('should get an existing collection', async () => {
      const collectionName = CHROMA_KEYS.userCollection(testUserId)
      const collection = await client.getCollection({
        ...defaultParams,
        name: collectionName
      })
      expect(collection.name).toBe(collectionName)
    })

    it('should delete a collection', async () => {
      const collectionName = CHROMA_KEYS.userCollection(testUserId)
      await client.deleteCollection({ name: collectionName })
      const collections = await client.listCollections()
      expect(collections).not.toContain(collectionName)
    })
  })

  describe('Document Operations', () => {
    const testMessage: ChromaMessage = {
      id: 'msg_1',
      userId: testUserId,
      content: 'Hello, this is a test message',
      embedding: Array(DEFAULT_CHROMA_CONFIG.embeddingDimension).fill(0.1),
      metadata: {
        timestamp: new Date().toISOString(),
        type: 'user',
        conversationId: testConversationId,
        topics: JSON.stringify(['test']),
        sentiment: 0.5,
        activityLevel: 'active'
      }
    }

    beforeEach(async () => {
      // Create a fresh collection for each test
      const collectionName = CHROMA_KEYS.userCollection(testUserId)
      await client.createCollection({
        ...defaultParams,
        name: collectionName
      })
    })

    afterEach(async () => {
      // Cleanup after each test
      const collectionName = CHROMA_KEYS.userCollection(testUserId)
      await client.deleteCollection({ name: collectionName })
    })

    it('should add a document to collection', async () => {
      const collection = await client.getCollection({
        ...defaultParams,
        name: CHROMA_KEYS.userCollection(testUserId)
      })
      
      await collection.add({
        ids: [testMessage.id],
        embeddings: [testMessage.embedding],
        metadatas: [testMessage.metadata],
        documents: [testMessage.content]
      })

      // Query to verify
      const result = await collection.query({
        queryEmbeddings: [testMessage.embedding],
        nResults: 1
      })

      expect(result.ids?.[0]?.[0]).toBe(testMessage.id)
      expect(result.documents?.[0]?.[0]).toBe(testMessage.content)
    })

    it('should query documents by similarity', async () => {
      const collection = await client.getCollection({
        ...defaultParams,
        name: CHROMA_KEYS.userCollection(testUserId)
      })
      
      // Add multiple documents
      const messages = [
        { ...testMessage, id: 'msg_1', content: 'Hello world' },
        { ...testMessage, id: 'msg_2', content: 'How are you?' },
        { ...testMessage, id: 'msg_3', content: 'Testing ChromaDB' }
      ]

      await collection.add({
        ids: messages.map(m => m.id),
        embeddings: messages.map(m => m.embedding),
        metadatas: messages.map(m => m.metadata),
        documents: messages.map(m => m.content)
      })

      // Query similar to 'Hello world'
      const result = await collection.query({
        queryTexts: ['Hello'],
        nResults: 1
      })

      expect(result.documents?.[0]?.[0]).toContain('Hello world')
    })

    it('should handle metadata filters', async () => {
      const collection = await client.getCollection({
        ...defaultParams,
        name: CHROMA_KEYS.userCollection(testUserId)
      })
      
      // Add messages with different types
      const messages = [
        { ...testMessage, id: 'msg_1', metadata: { ...testMessage.metadata, type: 'user' } },
        { ...testMessage, id: 'msg_2', metadata: { ...testMessage.metadata, type: 'assistant' } }
      ]

      await collection.add({
        ids: messages.map(m => m.id),
        embeddings: messages.map(m => m.embedding),
        metadatas: messages.map(m => m.metadata),
        documents: messages.map(m => m.content)
      })

      // Query only user messages
      const result = await collection.query({
        queryEmbeddings: [testMessage.embedding],
        where: { type: 'user' },
        nResults: 1
      })

      expect(result.metadatas?.[0]?.[0]?.type).toBe('user')
    })
  })

  describe('Error Handling', () => {
    it('should handle non-existent collection gracefully', async () => {
      await expect(
        client.getCollection({
          ...defaultParams,
          name: 'non_existent_collection'
        })
      ).rejects.toThrow()
    })

    it('should handle invalid embeddings', async () => {
      const collection = await client.getCollection({
        ...defaultParams,
        name: CHROMA_KEYS.userCollection(testUserId)
      })
      const invalidEmbedding = Array(DEFAULT_CHROMA_CONFIG.embeddingDimension + 1).fill(0.1)

      await expect(
        collection.add({
          ids: ['test'],
          embeddings: [invalidEmbedding],
          documents: ['test']
        })
      ).rejects.toThrow()
    })

    it('should handle concurrent operations', async () => {
      const collectionName = CHROMA_KEYS.userCollection(testUserId)
      
      // Try to create the same collection concurrently
      await Promise.all([
        client.createCollection({ ...defaultParams, name: collectionName }),
        client.createCollection({ ...defaultParams, name: collectionName })
      ]).catch(error => {
        expect(error).toBeDefined()
      })
    })
  })
}) 