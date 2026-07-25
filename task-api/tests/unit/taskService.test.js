const taskService = require('../../src/services/taskService');

describe('taskService', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('getAll', () => {
    it('returns an empty array when no tasks exist', () => {
      expect(taskService.getAll()).toEqual([]);
    });

    it('returns all created tasks', () => {
      taskService.create({ title: 'Task 1' });
      taskService.create({ title: 'Task 2' });
      expect(taskService.getAll()).toHaveLength(2);
    });

    it('returns a copy, not a reference to the internal store', () => {
      taskService.create({ title: 'Task 1' });
      const tasks = taskService.getAll();
      tasks.push({ id: 'fake' });
      expect(taskService.getAll()).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('returns the matching task', () => {
      const created = taskService.create({ title: 'Find me' });
      expect(taskService.findById(created.id)).toEqual(created);
    });

    it('returns undefined for a non-existent id', () => {
      expect(taskService.findById('non-existent-id')).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates a task with defaults applied', () => {
      const task = taskService.create({ title: 'Default fields' });
      expect(task).toMatchObject({
        title: 'Default fields',
        description: '',
        status: 'todo',
        priority: 'medium',
        dueDate: null,
        completedAt: null,
      });
      expect(task.id).toEqual(expect.any(String));
      expect(task.createdAt).toEqual(expect.any(String));
    });

    it('creates a task with explicit fields overriding defaults', () => {
      const task = taskService.create({
        title: 'Custom',
        description: 'desc',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2030-01-01T00:00:00.000Z',
      });
      expect(task).toMatchObject({
        title: 'Custom',
        description: 'desc',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2030-01-01T00:00:00.000Z',
      });
    });

    it('assigns a unique id to each task', () => {
      const t1 = taskService.create({ title: 'One' });
      const t2 = taskService.create({ title: 'Two' });
      expect(t1.id).not.toEqual(t2.id);
    });
  });

  describe('update', () => {
    it('updates fields on an existing task', () => {
      const created = taskService.create({ title: 'Old title' });
      const updated = taskService.update(created.id, { title: 'New title' });
      expect(updated.title).toBe('New title');
      expect(updated.id).toBe(created.id);
    });

    it('merges fields rather than replacing the whole task', () => {
      const created = taskService.create({ title: 'Keep desc', description: 'original' });
      const updated = taskService.update(created.id, { title: 'Changed' });
      expect(updated.description).toBe('original');
    });

    it('returns null for a non-existent id', () => {
      expect(taskService.update('non-existent-id', { title: 'x' })).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes an existing task and returns true', () => {
      const created = taskService.create({ title: 'To delete' });
      expect(taskService.remove(created.id)).toBe(true);
      expect(taskService.findById(created.id)).toBeUndefined();
    });

    it('returns false for a non-existent id', () => {
      expect(taskService.remove('non-existent-id')).toBe(false);
    });
  });

  describe('completeTask', () => {
    it('marks a task done and sets completedAt', () => {
      const created = taskService.create({ title: 'Finish me' });
      const completed = taskService.completeTask(created.id);
      expect(completed.status).toBe('done');
      expect(completed.completedAt).toEqual(expect.any(String));
    });

    // NOTE: this documents the EXPECTED behavior per the task shape contract.
    // The current implementation resets priority to 'medium' on completion — see bug report.
    it('preserves the task priority when completing', () => {
      const created = taskService.create({ title: 'High priority', priority: 'high' });
      const completed = taskService.completeTask(created.id);
      expect(completed.priority).toBe('high');
    });

    it('returns null for a non-existent id', () => {
      expect(taskService.completeTask('non-existent-id')).toBeNull();
    });
  });

  describe('assignTask', () => {
    it('assigns a trimmed assignee to an existing task', () => {
      const created = taskService.create({ title: 'Needs an owner' });
      const assigned = taskService.assignTask(created.id, '  Alice  ');
      expect(assigned.assignee).toBe('Alice');
      expect(assigned.id).toBe(created.id);
    });

    it('overwrites an existing assignee when reassigned', () => {
      const created = taskService.create({ title: 'Reassign me' });
      taskService.assignTask(created.id, 'Alice');
      const reassigned = taskService.assignTask(created.id, 'Bob');
      expect(reassigned.assignee).toBe('Bob');
    });

    it('leaves other fields untouched', () => {
      const created = taskService.create({ title: 'Keep fields', priority: 'high' });
      const assigned = taskService.assignTask(created.id, 'Alice');
      expect(assigned.priority).toBe('high');
      expect(assigned.title).toBe('Keep fields');
    });

    it('returns null for a non-existent id', () => {
      expect(taskService.assignTask('non-existent-id', 'Alice')).toBeNull();
    });
  });

  describe('getByStatus', () => {
    it('returns only tasks matching the exact status', () => {
      taskService.create({ title: 'A', status: 'todo' });
      taskService.create({ title: 'B', status: 'in_progress' });
      taskService.create({ title: 'C', status: 'done' });
      const result = taskService.getByStatus('todo');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A');
    });

    it('returns an empty array when no tasks match', () => {
      taskService.create({ title: 'A', status: 'todo' });
      expect(taskService.getByStatus('done')).toEqual([]);
    });

    // NOTE: documents expected exact-match filtering. The current implementation uses
    // String.includes(), so a substring like 'progress' incorrectly matches 'in_progress' — see bug report.
    it('does not return unrelated tasks whose status merely contains the filter as a substring', () => {
      taskService.create({ title: 'In progress task', status: 'in_progress' });
      const result = taskService.getByStatus('progress');
      expect(result).toHaveLength(0);
    });
  });

  describe('getPaginated', () => {
    beforeEach(() => {
      for (let i = 1; i <= 25; i++) {
        taskService.create({ title: `Task ${i}` });
      }
    });

    // NOTE: documents expected 1-indexed pagination (page 1 = first `limit` items).
    // The current implementation computes offset = page * limit, so page 1 skips
    // the first `limit` tasks — see bug report.
    it('returns the first page starting from the first task', () => {
      const page1 = taskService.getPaginated(1, 10);
      expect(page1).toHaveLength(10);
      expect(page1[0].title).toBe('Task 1');
    });

    it('returns the second page starting after the first page', () => {
      const page2 = taskService.getPaginated(2, 10);
      expect(page2[0].title).toBe('Task 11');
    });

    it('returns an empty array past the last page', () => {
      expect(taskService.getPaginated(10, 10)).toEqual([]);
    });

    it('returns an empty array when the store is empty', () => {
      taskService._reset();
      expect(taskService.getPaginated(1, 10)).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('returns zero counts for an empty store', () => {
      expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
    });

    it('counts tasks by status', () => {
      taskService.create({ title: 'A', status: 'todo' });
      taskService.create({ title: 'B', status: 'todo' });
      taskService.create({ title: 'C', status: 'in_progress' });
      taskService.create({ title: 'D', status: 'done' });
      expect(taskService.getStats()).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 0 });
    });

    it('counts a task with a past dueDate as overdue', () => {
      taskService.create({ title: 'Late', dueDate: '2000-01-01T00:00:00.000Z' });
      expect(taskService.getStats().overdue).toBe(1);
    });

    it('does not count completed tasks as overdue even with a past dueDate', () => {
      const task = taskService.create({ title: 'Late but done', dueDate: '2000-01-01T00:00:00.000Z' });
      taskService.completeTask(task.id);
      expect(taskService.getStats().overdue).toBe(0);
    });

    it('does not count tasks with no dueDate as overdue', () => {
      taskService.create({ title: 'No due date' });
      expect(taskService.getStats().overdue).toBe(0);
    });
  });
});
