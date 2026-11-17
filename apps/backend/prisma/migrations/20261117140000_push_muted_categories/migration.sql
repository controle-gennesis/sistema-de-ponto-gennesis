-- Categorias de push que o usuario desativou no Perfil do app (so guarda as desativadas).
CREATE TABLE IF NOT EXISTS "push_muted_categories" (
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_muted_categories_pkey" PRIMARY KEY ("userId", "category")
);
