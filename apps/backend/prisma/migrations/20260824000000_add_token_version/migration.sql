-- Add tokenVersion to Usuario for server-side session revocation (C3)
ALTER TABLE "Usuario" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
