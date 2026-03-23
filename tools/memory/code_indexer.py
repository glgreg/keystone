import os
import hashlib
import sys

# Ensure local tools are in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from vector_engine import VectorEngine

# Configuration
IGNORE_DIRS = {".git", "__pycache__", "node_modules", "memory", ".venv", "dist", "build"}
IGNORE_EXTENSIONS = {".pyc", ".exe", ".bin", ".jpg", ".png", ".gif", ".pdf", ".zip"}

def get_file_hash(file_path):
    """Generates a hash for the file content to track changes."""
    hasher = hashlib.md5()
    with open(file_path, 'rb') as f:
        buf = f.read()
        hasher.update(buf)
    return hasher.hexdigest()

def chunk_text(text, chunk_size=1000, overlap=100):
    """Splits text into chunks with overlap for better context."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += (chunk_size - overlap)
    return chunks

def index_project(root_dir="."):
    engine = VectorEngine()
    print(f"[*] Starting indexing for: {os.path.abspath(root_dir)}")
    
    indexed_count = 0
    for root, dirs, files in os.walk(root_dir):
        # Remove ignored directories in-place to prevent further walking
        valid_dirs = [d for d in dirs if d not in IGNORE_DIRS]
        dirs.clear()
        dirs.extend(valid_dirs)
        
        for file in files:
            if any(file.endswith(ext) for ext in IGNORE_EXTENSIONS):
                continue
                
            file_path = os.path.join(root, file)
            rel_path = os.path.relpath(file_path, root_dir)
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                file_hash = get_file_hash(file_path)
                chunks = chunk_text(content)
                
                documents = []
                metadatas = []
                ids = []
                
                for i, chunk in enumerate(chunks):
                    documents.append(chunk)
                    metadatas.append({
                        "path": rel_path,
                        "hash": file_hash,
                        "chunk": i
                    })
                    ids.append(f"{rel_path}_chunk_{i}")
                
                engine.add_documents(documents, metadatas, ids)
                indexed_count += 1
                print(f"[+] Indexed: {rel_path} ({len(chunks)} chunks)")
                
            except Exception as e:
                print(f"[!] Error indexing {rel_path}: {e}")

    print(f"[*] Indexing complete. Total files processed: {indexed_count}")

if __name__ == "__main__":
    index_project()
