const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();
const cors = require('cors');  

const app = express();
app.use(express.json());

app.use(cors({
  origin: ['http://localhost:3000'],          // front dev CRA
  credentials: true,                           // si tu utilises des cookies plus tard
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Test DB : simple requête SELECT
app.get('/dbtest', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).send('Erreur de connexion DB');
  }
});

app.get('/users', async (req, res) => {
    try {
      const result = await pool.query('SELECT id, name, email, role, created_at FROM users ORDER BY id');
      res.json(result.rows);
    } catch (err) {
      console.error('Erreur récupération utilisateurs', err);
      res.status(500).send('Erreur serveur');
    }
  });
  
  app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      // Requête 1 : récupérer l'utilisateur
      const userResult = await pool.query(
        'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
        [id]
      );
  
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'Utilisateur non trouvé' });
      }
  
      const user = userResult.rows[0];
  
      // Requête 2 : récupérer les tickets de cet utilisateur
      const ticketsResult = await pool.query(
        `SELECT id, service, priority, description, status, created_at, updated_at
         FROM tickets WHERE user_id = $1 ORDER BY created_at DESC`,
        [id]
      );
  
      user.tickets = ticketsResult.rows;  // ajout tickets au JSON user
  
      res.json(user);
    } catch (err) {
      console.error('Erreur récupération utilisateur + tickets', err);
      res.status(500).send('Erreur serveur');
    }
  });
  
  


app.post('/tickets', async (req, res) => {
    const { service, priority, description, user_id } = req.body;
  
    if (!service || !description || !user_id) {
      return res.status(400).json({ error: 'Champ manquant : service, description ou user_id' });
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
      res.status(500).send('Erreur serveur');
    }
  });
  
  app.post('/users', async (req, res) => {
    const { name, email, role } = req.body;
  
    if (!name || !email) {
      return res.status(400).json({ error: 'Nom et email requis' });
    }
  
    try {
      const result = await pool.query(
        `INSERT INTO users (name, email, role)
         VALUES ($1, $2, $3)
         RETURNING id, name, email, role, created_at`,
        [name, email, role || 'user']
      );
  
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Erreur création utilisateur', err);
  
      // Gérer erreur email déjà utilisé
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Email déjà utilisé' });
      }
  
      res.status(500).send('Erreur serveur');
    }
  });
  

  app.get('/tickets', async (req, res) => {
    const { service, status, user_id } = req.query;
  
    let query = 'SELECT * FROM tickets';
    const values = [];
    const conditions = [];
  
    if (service) {
      values.push(service);
      conditions.push(`service = $${values.length}`);
    }
  
    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
  
    if (user_id) {
      values.push(user_id);
      conditions.push(`user_id = $${values.length}`);
    }
  
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
  
    query += ' ORDER BY created_at DESC';
  
    try {
      const result = await pool.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error('Erreur récupération tickets', err);
      res.status(500).send('Erreur serveur');
    }
  });
  
  app.get('/tickets/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const result = await pool.query(
        'SELECT * FROM tickets WHERE id = $1',
        [id]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket non trouvé' });
      }
  
      res.json(result.rows[0]);
    } catch (err) {
      console.error('Erreur récupération ticket', err);
      res.status(500).send('Erreur serveur');
    }
  });
  

  app.put('/tickets/:id', async (req, res) => {
    const { id } = req.params;
    const { status, priority, service, description } = req.body;
  
    const fields = [];
    const values = [];
    let paramIndex = 1;
  
    // Construction dynamique de la requête UPDATE
    if (status) {
      fields.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (priority) {
      fields.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (service) {
      fields.push(`service = $${paramIndex++}`);
      values.push(service);
    }
    if (description) {
      fields.push(`description = $${paramIndex++}`);
      values.push(description);
    }
  
    // Si aucun champ à mettre à jour
    if (fields.length === 0) {
      return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    }
  
    // Ajoute updated_at automatiquement
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
  
    // Ajout de la condition WHERE id = ...
    const query = `
      UPDATE tickets
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *`;
  
    values.push(id);  // Dernier paramètre : l’ID
  
    try {
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket non trouvé' });
      }
      res.json(result.rows[0]);  // Retourne le ticket mis à jour
    } catch (err) {
      console.error('Erreur mise à jour ticket', err);
      res.status(500).send('Erreur serveur');
    }
  });
  
  app.delete('/tickets/:id', async (req, res) => {
    const { id } = req.params;
  
    try {
      const result = await pool.query(
        'DELETE FROM tickets WHERE id = $1 RETURNING *',
        [id]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Ticket non trouvé' });
      }
  
      res.json({ message: 'Ticket supprimé', ticket: result.rows[0] });
    } catch (err) {
      console.error('Erreur suppression ticket', err);
      res.status(500).send('Erreur serveur');
    }
  });
  

app.listen(4000, () => console.log('API sur http://localhost:4000'));
