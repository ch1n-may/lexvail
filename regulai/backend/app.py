import os
from sentence_transformers import SentenceTransformer, util
from transformers import pipeline

# Embedding model for retrieval
embedder = SentenceTransformer('all-MiniLM-L6-v2')

def chunk_text(text, chunk_size=400):
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk = ' '.join(words[i:i+chunk_size])
        chunks.append(chunk)
    return chunks

def load_documents_chunks(folder_path):
    docs_chunks = {}
    docs_full = {}
    for filename in os.listdir(folder_path):
        if filename.endswith('.txt'):
            with open(os.path.join(folder_path, filename), 'r', encoding='utf-8') as f:
                text = f.read()
                docs_full[filename] = text  # Store full doc for summarization
                chunks = chunk_text(text)
                for idx, chunk in enumerate(chunks):
                    key = f"{filename}_chunk{idx+1}"
                    docs_chunks[key] = chunk
    return docs_chunks, docs_full

def retrieve_relevant_context(question, docs_chunks):
    question_emb = embedder.encode(question, convert_to_tensor=True)
    best_chunk = None
    best_score = -1
    for key, chunk in docs_chunks.items():
        chunk_emb = embedder.encode(chunk, convert_to_tensor=True)
        score = util.pytorch_cos_sim(question_emb, chunk_emb).item()
        if score > best_score:
            best_score = score
            best_chunk = chunk
    return best_chunk

if __name__ == "__main__":
    docs_chunks, docs_full = load_documents_chunks('legaldocs')
    qa_pipeline = pipeline("question-answering", model="distilbert-base-cased-distilled-squad")
    summarization_pipeline = pipeline("summarization", model="facebook/bart-large-cnn")

    user_input = input("Type 'Q' for question-answering or 'S' for summarization: ").strip().upper()

    if user_input == 'Q':
        question = input("Enter your legal question: ")
        context = retrieve_relevant_context(question, docs_chunks)
        if context:
            answer = qa_pipeline(question=question, context=context)
            print("AI Answer:", answer['answer'])
        else:
            print("Sorry, no relevant legal documents found.")
    elif user_input == 'S':
        print("Available documents:")
        for filename in docs_full.keys():
            print("-", filename)
        doc_name = input("Enter the document name you want summarized: ").strip()
        if doc_name in docs_full:
            summary = summarization_pipeline(docs_full[doc_name], max_length=100, min_length=30, do_sample=False)
            print("Summary:", summary[0]['summary_text'])
        else:
            print("Document not found.")
    else:
        print("Invalid input. Please type 'Q' or 'S'.")
