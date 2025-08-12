from flask import Flask, render_template, request
from sentence_transformers import SentenceTransformer, util
from transformers import pipeline
import os

app = Flask(__name__)

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
                docs_full[filename] = text
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

docs_chunks, docs_full = load_documents_chunks('legaldocs')
qa_pipeline = pipeline("question-answering", model="distilbert-base-cased-distilled-squad")
summarization_pipeline = pipeline("summarization", model="facebook/bart-large-cnn")

@app.route('/', methods=['GET', 'POST'])
def home():
    answer = None
    summary = None
    error = None

    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'question':
            question = request.form.get('question')
            context = retrieve_relevant_context(question, docs_chunks)
            if context:
                result = qa_pipeline(question=question, context=context)
                answer = result['answer']
            else:
                error = "No relevant legal documents found."
        elif action == 'summary':
            doc_name = request.form.get('doc_name')
            if doc_name in docs_full:
                summary_result = summarization_pipeline(docs_full[doc_name], max_length=100, min_length=30, do_sample=False)
                summary = summary_result[0]['summary_text']
            else:
                error = "Document not found."

    return render_template('index.html', answer=answer, summary=summary, error=error, docs=list(docs_full.keys()))

if __name__ == "__main__":
    app.run(debug=True)
