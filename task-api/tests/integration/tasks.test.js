const request = require('supertest');
const app = require('../../src/app');
const taskService = require('../../src/services/taskService');

describe('Task API routes', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('GET /tasks', () => {
    it('returns an empty array when no tasks exist', async () => {
      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all created tasks', async () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });
      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('filters tasks by exact status', async () => {
      taskService.create({ title: 'Todo task', status: 'todo' });
      taskService.create({ title: 'Done task', status: 'done' });
      const res = await request(app).get('/tasks?status=done');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Done task');
    });

    // NOTE: documents expected 1-indexed pagination behavior — see bug report
    // for the current offset = page * limit implementation.
    it('paginates results starting from the first task on page 1', async () => {
      for (let i = 1; i <= 15; i++) {
        taskService.create({ title: `Task ${i}` });
      }
      const res = await request(app).get('/tasks?page=1&limit=10');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(10);
      expect(res.body[0].title).toBe('Task 1');
    });
  });

  describe('GET /tasks/stats', () => {
    it('returns zero counts when there are no tasks', async () => {
      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
    });

    it('returns correct counts and overdue total', async () => {
      taskService.create({ title: 'A', status: 'todo' });
      taskService.create({ title: 'B', status: 'done' });
      taskService.create({ title: 'Overdue', dueDate: '2000-01-01T00:00:00.000Z' });
      const res = await request(app).get('/tasks/stats');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ todo: 2, in_progress: 0, done: 1, overdue: 1 });
    });
  });

  describe('POST /tasks', () => {
    it('creates a task with valid data', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Write tests', priority: 'high' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo' });
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('rejects a task with a missing title', async () => {
      const res = await request(app).post('/tasks').send({ priority: 'high' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it('rejects a task with an invalid status', async () => {
      const res = await request(app).post('/tasks').send({ title: 'Bad status', status: 'bogus' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status/i);
    });

    it('rejects a task with an invalid dueDate', async () => {
      const res = await request(app).post('/tasks').send({ title: 'Bad date', dueDate: 'not-a-date' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/dueDate/i);
    });
  });

  describe('PUT /tasks/:id', () => {
    it('updates an existing task', async () => {
      const created = taskService.create({ title: 'Original' });
      const res = await request(app).put(`/tasks/${created.id}`).send({ title: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
    });

    it('returns 404 for a non-existent task', async () => {
      const res = await request(app).put('/tasks/non-existent-id').send({ title: 'Updated' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid priority', async () => {
      const created = taskService.create({ title: 'Original' });
      const res = await request(app).put(`/tasks/${created.id}`).send({ priority: 'urgent' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes an existing task', async () => {
      const created = taskService.create({ title: 'To delete' });
      const res = await request(app).delete(`/tasks/${created.id}`);
      expect(res.status).toBe(204);
      expect(taskService.findById(created.id)).toBeUndefined();
    });

    it('returns 404 for a non-existent task', async () => {
      const res = await request(app).delete('/tasks/non-existent-id');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /tasks/:id/complete', () => {
    it('marks a task as complete', async () => {
      const created = taskService.create({ title: 'Finish' });
      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).toEqual(expect.any(String));
    });

    // NOTE: documents expected behavior (priority untouched by completion) — see bug report.
    it('preserves the original priority when completing', async () => {
      const created = taskService.create({ title: 'Finish', priority: 'high' });
      const res = await request(app).patch(`/tasks/${created.id}/complete`);
      expect(res.status).toBe(200);
      expect(res.body.priority).toBe('high');
    });

    it('returns 404 for a non-existent task', async () => {
      const res = await request(app).patch('/tasks/non-existent-id/complete');
      expect(res.status).toBe(404);
    });
  });
});
