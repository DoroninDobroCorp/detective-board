import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const extras = [
  { to: '/books', icon: '📚', label: 'Книги' },
  { to: '/movies', icon: '🎬', label: 'Фильмы' },
  { to: '/games', icon: '🎮', label: 'Игры' },
  { to: '/purchases', icon: '🛒', label: 'Покупки' },
  { to: '/diary', icon: '📔', label: 'Дневник' },
  { to: '/achievements', icon: '🏅', label: 'Достижения' },
];

const ExtrasSwitcher: React.FC = () => {
  const location = useLocation();
  return (
    <nav className="extras-switcher" aria-label="Навигация по допстраницам">
      {extras.map((item) => {
        const active = location.pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`extras-switcher__link${active ? ' is-active' : ''}`}
            title={item.label}
            aria-label={item.label}
          >
            {item.icon}
          </Link>
        );
      })}
    </nav>
  );
};

export default ExtrasSwitcher;
