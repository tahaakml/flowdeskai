const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(express.json());

app.use(cors({
  origin: ['http://localhost:3000'],
  credentials: true,
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware d'authentification
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Middleware de vérification des rôles
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
  };
};

// === AUTHENTICATION ===

// Login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Générer JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Retourner user sans password_hash
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      token
    });
  } catch (err) {
    console.error('Erreur login:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Register
app.post('/auth/register', async (req, res) => {
  const { name, email, password, role = 'user', service } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  }

  try {
    // Vérifier si l'email existe déjà
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }

    // Hasher le mot de passe
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, service)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, service, created_at`,
      [name, email, password_hash, role, service]
    );

    const newUser = result.rows[0];

    // Générer JWT
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      user: newUser,
      token
    });
  } catch (err) {
    console.error('Erreur register:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// === USERS MANAGEMENT ===

// Get all users (Admin only)
app.get('/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, service, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur récupération utilisateurs', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get user by ID
app.get('/users/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const requesterId = req.user.id;
  const requesterRole = req.user.role;

  // Vérifier les permissions
  if (requesterRole !== 'admin' && parseInt(id) !== requesterId) {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  try {
    const userResult = await pool.query(
      'SELECT id, name, email, role, service, created_at FROM users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    const user = userResult.rows[0];

    // Récupérer les tickets de l'utilisateur
    const ticketsResult = await pool.query(
      `SELECT id, service, priority, description, status, created_at, updated_at
       FROM tickets WHERE user_id = $1 ORDER BY created_at DESC`,
      [id]
    );

    user.tickets = ticketsResult.rows;

    res.json(user);
  } catch (err) {
    console.error('Erreur récupération utilisateur', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update user (Admin only)
app.put('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name, email, role, service } = req.body;

  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (name) {
    fields.push(`name = $${paramIndex++}`);
    values.push(name);
  }
  if (email) {
    fields.push(`email = $${paramIndex++}`);
    values.push(email);
  }
  if (role) {
    fields.push(`role = $${paramIndex++}`);
    values.push(role);
  }
  if (service) {
    fields.push(`service = $${paramIndex++}`);
    values.push(service);
  }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);

  const query = `
    UPDATE users
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, name, email, role, service, created_at, updated_at`;

  values.push(id);

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur mise à jour utilisateur', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete user (Admin only)
app.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, name, email',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ message: 'Utilisateur supprimé', user: result.rows[0] });
  } catch (err) {
    console.error('Erreur suppression utilisateur', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// === TICKETS ===

// Get tickets based on user role
app.get('/tickets', authenticateToken, async (req, res) => {
  const { service, status, user_id, priority } = req.query;
  const userId = req.user.id;
  const userRole = req.user.role;

  let query = 'SELECT t.*, u.name as user_name, u.email as user_email FROM tickets t JOIN users u ON t.user_id = u.id';
  const values = [];
  const conditions = [];

  // Filtrage basé sur le rôle
  if (userRole === 'user') {
    // Les utilisateurs ne voient que leurs propres tickets
    values.push(userId);
    conditions.push(`t.user_id = $${values.length}`);
  } else if (userRole === 'manager') {
    // Les managers voient les tickets de leur service
    const userResult = await pool.query('SELECT service FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length > 0 && userResult.rows[0].service) {
      values.push(userResult.rows[0].service);
      conditions.push(`t.service = $${values.length}`);
    }
  }
  // Admin voit tous les tickets (pas de condition)

  // Filtres additionnels
  if (service) {
    values.push(service);
    conditions.push(`t.service = $${values.length}`);
  }

  if (status) {
    values.push(status);
    conditions.push(`t.status = $${values.length}`);
  }

  if (user_id && (userRole === 'admin' || userRole === 'manager')) {
    values.push(user_id);
    conditions.push(`t.user_id = $${values.length}`);
  }

  if (priority) {
    values.push(priority);
    conditions.push(`t.priority = $${values.length}`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY t.created_at DESC';

  try {
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur récupération tickets', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create ticket
app.post('/tickets', authenticateToken, async (req, res) => {
  const { service, priority, description } = req.body;
  const user_id = req.user.id;

  if (!service || !description) {
    return res.status(400).json({ error: 'Service et description requis' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tickets (service, priority, description, user_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [service, priority || 'moyenne', description, user_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erreur insertion ticket', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update ticket
app.put('/tickets/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status, priority, service, description } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Vérifier les permissions
    const ticketResult = await pool.query('SELECT user_id, service FROM tickets WHERE id = $1', [id]);
    
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }

    const ticket = ticketResult.rows[0];

    // Permission check
    if (userRole === 'user' && ticket.user_id !== userId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    
    if (userRole === 'manager') {
      const userResult = await pool.query('SELECT service FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0 || userResult.rows[0].service !== ticket.service) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (status) {
      fields.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (priority && (userRole === 'admin' || userRole === 'manager')) {
      fields.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (service && userRole === 'admin') {
      fields.push(`service = $${paramIndex++}`);
      values.push(service);
    }
    if (description && (userRole === 'admin' || ticket.user_id === userId)) {
      fields.push(`description = $${paramIndex++}`);
      values.push(description);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour ou permissions insuffisantes' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const query = `
      UPDATE tickets
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *`;

    values.push(id);

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erreur mise à jour ticket', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete ticket (Admin only or ticket owner)
app.delete('/tickets/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Vérifier les permissions
    const ticketResult = await pool.query('SELECT user_id FROM tickets WHERE id = $1', [id]);
    
    if (ticketResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket non trouvé' });
    }

    const ticket = ticketResult.rows[0];

    if (userRole !== 'admin' && ticket.user_id !== userId) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const result = await pool.query(
      'DELETE FROM tickets WHERE id = $1 RETURNING *',
      [id]
    );

    res.json({ message: 'Ticket supprimé', ticket: result.rows[0] });
  } catch (err) {
    console.error('Erreur suppression ticket', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get dashboard stats
app.get('/dashboard/stats', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    let stats = {};

    if (userRole === 'admin') {
      // Stats globales pour admin
      const ticketStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'ouvert' THEN 1 END) as open,
          COUNT(CASE WHEN status = 'en_cours' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'resolu' THEN 1 END) as closed
        FROM tickets
      `);
      
      const userCount = await pool.query('SELECT COUNT(*) as total FROM users');
      
      stats = {
        tickets: ticketStats.rows[0],
        users: userCount.rows[0],
        services: await pool.query(`
          SELECT service, COUNT(*) as count 
          FROM tickets 
          GROUP BY service 
          ORDER BY count DESC
        `)
      };
    } else if (userRole === 'manager') {
      // Stats du service pour manager
      const userService = await pool.query('SELECT service FROM users WHERE id = $1', [userId]);
      const service = userService.rows[0]?.service;

      if (service) {
        const ticketStats = await pool.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'ouvert' THEN 1 END) as open,
            COUNT(CASE WHEN status = 'en_cours' THEN 1 END) as in_progress,
            COUNT(CASE WHEN status = 'resolu' THEN 1 END) as closed
          FROM tickets WHERE service = $1
        `, [service]);

        stats = {
          tickets: ticketStats.rows[0],
          service: service
        };
      }
    } else {
      // Stats personnelles pour user
      const ticketStats = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'ouvert' THEN 1 END) as open,
          COUNT(CASE WHEN status = 'en_cours' THEN 1 END) as in_progress,
          COUNT(CASE WHEN status = 'resolu' THEN 1 END) as closed
        FROM tickets WHERE user_id = $1
      `, [userId]);

      stats = {
        tickets: ticketStats.rows[0]
      };
    }

    res.json(stats);
  } catch (err) {
    console.error('Erreur récupération stats', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Test DB
app.get('/dbtest', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur de connexion DB');
  }
});

app.listen(4000, () => console.log('API sur http://localhost:4000'));