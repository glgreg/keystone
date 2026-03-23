import os
import chromadb
from chromadb.config import Settings

class VectorEngine:
    def __init__(self, collection_name="agent_memory", persist_directory="./memory/chroma_db"):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        
        # Disable telemetry
        os.environ["ANONYMIZED_TELEMETRY"] = "False"
        
        self.client = chromadb.PersistentClient(path=self.persist_directory)
        self.collection = self.client.get_or_create_collection(name=self.collection_name)

    def add_documents(self, documents, metadatas, ids):
        """Adds or updates documents in the vector store."""
        self.collection.upsert(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )

    def query(self, query_text, n_results=5):
        """Queries the vector store for relevant context."""
        return self.collection.query(
            query_texts=[query_text],
            n_results=n_results
        )

    def count(self):
        return self.collection.count()

    def reset(self):
        """Clears the collection."""
        self.client.delete_collection(self.collection_name)
        self.collection = self.client.get_or_create_collection(name=self.collection_name)
