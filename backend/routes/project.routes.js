const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { sanitizeInput, sanitizeForLog } = require('../utils/sanitization');
const { logger } = require('../utils/logger');

const router = express.Router();

// Get projects for a task list
router.get('/task-lists/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM projects WHERE task_list_id = $1 ORDER BY name',
      [id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Create project
router.post('/task-lists/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const sanitizedName = sanitizeInput(name);

    const result = await pool.query(
      'INSERT INTO projects (name, task_list_id) VALUES ($1, $2) RETURNING *',
      [sanitizedName, id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Delete project
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    logger.debug('Deleting project', { projectId: sanitizeForLog(id), userId: sanitizeForLog(req.user.userId) });

    const projectCheck = await pool.query(
      'SELECT p.*, tl.owner_id FROM projects p JOIN task_lists tl ON p.task_list_id = tl.id WHERE p.id = $1',
      [id]
    );

    if (projectCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectCheck.rows[0];

    const memberCheck = await pool.query(
      'SELECT id FROM task_list_members WHERE task_list_id = $1 AND user_id = $2',
      [project.task_list_id, req.user.userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    logger.info('Project deleted', { projectId: sanitizeForLog(id) });

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    logger.error('Delete project error', { error: sanitizeForLog(error.message) });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
