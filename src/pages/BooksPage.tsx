import React from 'react';
import { MediaCollectionPage } from '../components/MediaCollectionPage';
import { resolveBookCover } from '../coverBackfill';

export const BooksPage: React.FC = () => (
  <MediaCollectionPage
    tableName="books"
    title="Книги"
    icon="📚"
    parentPath="Книги"
    itemType="book"
    placeholder="Название книги"
    searchSuffix="book cover"
    coverLabel="Обложка"
    deletePrompt="Удалить книгу?"
    resolveFunction={resolveBookCover}
  />
);

export default BooksPage;
