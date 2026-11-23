function requireRole(...roles) {
  return (req, res, suite) => {
    const u = req.session.user;
    if (!u) {
      const next = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
      return res.redirect(`/login${next}`);
    }
    if (!roles.includes(u.role)) {
      return res.status(403).render('erreur', { titre: 'Accès refusé', message: 'Vous n’avez pas accès à cette page.' });
    }
    suite();
  };
}

module.exports = { requireRole };