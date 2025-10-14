import React from 'react';
import { MediaCollectionPage } from '../components/MediaCollectionPage';
import { resolveGameCover } from '../coverBackfill';

export const GamesPage: React.FC = () => (
  <MediaCollectionPage
    tableName="games"
    title="Игры"
    icon="🎮"
    parentPath="Игры"
    itemType="game"
    placeholder="Название игры"
    searchSuffix="game cover"
    coverLabel="Обложка"
    deletePrompt="Удалить игру?"
    resolveFunction={resolveGameCover}
  />
);

export default GamesPage;
