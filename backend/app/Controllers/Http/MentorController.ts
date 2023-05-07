import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Task from 'App/Models/Task'
import User from 'App/Models/User'
import TaskMentor from 'App/Models/TaskMentor'
import Database from '@ioc:Adonis/Lucid/Database'
import Roles from 'App/Enums/Roles'

export default class MentorController {
  async getAllMentors({ auth, response, request }: HttpContextContract) {
    const user = auth.user
    if (!user || !user.isAdmin) {
      response.unauthorized({ message: 'You are not authorized to access this resource.' })
      return
    }
    const { page, limit } = request.qs()
    const mentors = await User.query()
      .where('roleId', Roles.MENTOR)
      .select(['id', 'firstName', 'lastName'])
      .paginate(page || 1, limit || 10)
    return { status: 'success', message: 'Fetched all mentors successful', mentors }
  }

  async getMentorTask({ auth, params, request, response }: HttpContextContract) {
    const user = auth.user
    if (!user || !user.isAdmin) {
      response.unauthorized({ message: 'You are not authorized to access this resource.' })
      return
    }
    try {
      const { search } = request.all()
      const tasks = await Task.query()
        .whereHas('mentors', (builder) => {
          builder.where('mentor_id', params.mentorId)
        })
        .where((query) => {
          if (search) {
            query
              .whereRaw('LOWER(title) LIKE ?', [`%${search.toLowerCase()}%`])
              .orWhereRaw('LOWER(description) LIKE ?', [`%${search.toLowerCase()}%`])
          }
        })
        .preload('mentors')
        .preload('taskReports')
        .preload('user', (query) => {
          query.select(['firstName', 'lastName'])
        })
        .exec()

      const tasksWithCounts = tasks.map((task) => {
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          meta: task.meta,
          creatorUserId: task.userId,
          createdBy: `${task.user.firstName} ${task.user.lastName}`,
          startDate: task.startDate,
          endDate: task.endDate,
          typeOfReport: task.typeOfReport,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          reports: task.taskReports?.map((report) => ({
            id: report.id,
            achievement: report.achievement,
            blocker: report.blocker,
            recommendation: report.recommendation,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          })),
          taskReportCount: task.taskReports.length,
        }
      })

      return response
        .status(200)
        .json({ status: 'success', message: 'Tasks fetched successfully', data: tasksWithCounts })
    } catch (error) {
      return response.status(500).send({ message: 'Error fetching task.' })
    }
  }

  async search({ request, response, params }: HttpContextContract) {
    const { query } = request.all()

    try {
      const tasks = await Task.query()
        .whereHas('mentors', (builder) => {
          builder.where('mentor_id', params.mentorId)
        })
        .where('title', 'like', `%${query}%`)
        .orWhere('description', 'like', `%${query}%`)
        .preload('mentors')
        .preload('taskReports')
        .preload('user', (query) => {
          query.select(['firstName', 'lastName'])
        })
        .exec()

      const tasksWithCounts = tasks.map((task) => {
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          meta: task.meta,
          creatorUserId: task.userId,
          createdBy: `${task.user.firstName} ${task.user.lastName}`,
          startDate: task.startDate,
          endDate: task.endDate,
          typeOfReport: task.typeOfReport,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          reports: task.taskReports?.map((report) => ({
            id: report.id,
            achievement: report.achievement,
            blocker: report.blocker,
            recommendation: report.recommendation,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          })),
          taskReportCount: task.taskReports.length,
        }
      })

      return response
        .status(200)
        .json({ status: 'success', message: 'Tasks fetched successfully', data: tasksWithCounts })
    } catch (error) {
      return response.status(500).send({ message: 'Error fetching tasks.' })
    }
  }

  async removeMentorFromTask({ auth, params, response }: HttpContextContract) {
    const adminUser = await auth.authenticate()

    if (!adminUser || adminUser.roleId !== Roles.ADMIN) {
      return response.unauthorized({ message: 'You are not authorized to perform this action' })
    }
    try {
      const { taskId, mentorId } = params

      const taskMentor = await TaskMentor.query()
        .where('taskId', taskId)
        .where('mentorId', mentorId)
        .first()

      if (!taskMentor) {
        return response.badRequest({ message: 'Mentor not found for this task' })
      }

      await taskMentor.delete()

      return response.ok({ status: 'success', message: 'Mentor removed from task' })
    } catch (error) {
      return response.status(500).send({ message: 'Error removing mentor from task.' })
    }
  }

  async deleteAMentor({ auth, params, response }: HttpContextContract) {
    const user = auth.user
    if (!user || !user.isAdmin) {
      response.unauthorized({ message: 'You are not authorized to access this resource.' })
      return
    }
    const mentorId = params.mentorId

    try {
      await Database.transaction(async (trx) => {
        const result = await User.query()
          .where('id', mentorId)
          .andWhere('roleId', Roles.MENTOR)
          .firstOrFail()
        result.useTransaction(trx).delete()
        const taskMentors = await TaskMentor.query()
          .where('id', mentorId)
          .preload('task')
          .useTransaction(trx)
        taskMentors.map(async (taskMentor) => {
          await taskMentor.useTransaction(trx).delete()
          const task = taskMentor.task
          await task.related('mentors').detach([mentorId])
        })
      })

      return response.ok({ message: 'Mentor deleted successfully' })
    } catch (error) {
      response.badRequest({ message: 'Error deleting User', status: 'Error' })
    }
  }
}
