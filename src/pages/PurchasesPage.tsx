import React from 'react';
import { MediaCollectionPage } from '../components/MediaCollectionPage';
import { resolvePurchaseImage } from '../coverBackfill';

export const PurchasesPage: React.FC = () => (
  <MediaCollectionPage
    tableName="purchases"
    title="Покупки"
    icon="🛍️"
    parentPath="Покупки"
    itemType="purchase"
    placeholder="Что купить"
    searchSuffix="product photo"
    coverLabel="Обложка"
    deletePrompt="Удалить покупку?"
    resolveFunction={resolvePurchaseImage}
  />
);

export default PurchasesPage;
