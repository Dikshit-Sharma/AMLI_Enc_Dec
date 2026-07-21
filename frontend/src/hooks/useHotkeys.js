import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const CTRL = (e) => e.ctrlKey || e.metaKey;

export default function useHotkeys({ onToggleHelp, onEscape } = {}) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      if (CTRL(e) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        navigate('/cipher');
        return;
      }
      if (CTRL(e) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        navigate('/artifacts');
        return;
      }
      if (CTRL(e) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        navigate('/library');
        return;
      }
      if (CTRL(e) && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        navigate('/jenkins');
        return;
      }
      if (e.key === '?' && !CTRL(e)) {
        e.preventDefault();
        onToggleHelp?.();
        return;
      }
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, onToggleHelp, onEscape]);
}
