import React from 'react';
import { MediaCollectionPage } from '../components/MediaCollectionPage';
import { resolveMoviePoster } from '../coverBackfill';

export const MoviesPage: React.FC = () => (
  <MediaCollectionPage
    tableName="movies"
    title="Фильмы"
    icon="🎬"
    parentPath="Фильмы"
    itemType="movie"
    placeholder="Название фильма"
    searchSuffix="movie poster"
    coverLabel="Постер"
    deletePrompt="Удалить фильм?"
    resolveFunction={resolveMoviePoster}
  />
);

export default MoviesPage;
