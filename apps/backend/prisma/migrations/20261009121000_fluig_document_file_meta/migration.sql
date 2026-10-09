-- Cache dos metadados de anexo do GED Fluig (nome e se o documento está vazio).
CREATE TABLE IF NOT EXISTS "fluig_document_file_meta" (
    "documentId" TEXT NOT NULL,
    "filename" TEXT,
    "downloadUrl" TEXT,
    "empty" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fluig_document_file_meta_pkey" PRIMARY KEY ("documentId")
);
