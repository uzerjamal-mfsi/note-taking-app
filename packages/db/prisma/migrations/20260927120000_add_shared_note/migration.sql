-- CreateTable
CREATE TABLE "SharedNote" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedNote_noteId_key" ON "SharedNote"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedNote_token_key" ON "SharedNote"("token");

-- AddForeignKey
ALTER TABLE "SharedNote" ADD CONSTRAINT "SharedNote_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
