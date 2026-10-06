import fs from 'fs/promises'
import path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { WORKING_DIR } from './fileSystem'
import { ensureMetadataDir } from '../workspace'

const BASE_DIR = path.join(WORKING_DIR, '.agent-todos')

const TaskFilterSchema = z.object({
  filename: z.string(),
  filterByStatus: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
  filterByPriority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
})

export const filterTasksTool = tool(
  async ({ filename, filterByStatus, filterByPriority }) => {
    try {
      const filePath = path.join(BASE_DIR, filename)

      // Check if file exists using fs.promises.access
      try {
        await fs.access(filePath)
      } catch {
        return 'No TODO list found.'
      }

      const raw = await fs.readFile(filePath, 'utf8')
      const todos = JSON.parse(raw)

      if (!Array.isArray(todos)) {
        return '❌ Invalid TODO list format.'
      }

      // Filter tasks based on status and priority
      let filteredTodos = todos

      if (filterByStatus) {
        filteredTodos = filteredTodos.filter((task: any) => task.status === filterByStatus)
      }

      if (filterByPriority) {
        filteredTodos = filteredTodos.filter((task: any) => task.priority === filterByPriority)
      }

      return `<think>${JSON.stringify(filteredTodos, null, 2)}</think>`
    } catch (error: any) {
      return `❌ Error filtering tasks: ${error.message}`
    }
  },
  {
    name: 'filter_tasks',
    description: `Filters tasks in a TODO list based on status and priority.

    Usage:
    - Filter by status: /todo filter <status> (e.g., pending, in_progress, completed, blocked)
    - Filter by priority: /todo prioritize <priority> (e.g., low, medium, high, critical)

    The returned tasks include their complete objects and IDs so the Manager
    agent can execute them and later call update_todos.`,
    schema: TaskFilterSchema,
  }
)
