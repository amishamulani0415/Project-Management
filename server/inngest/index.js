import { Inngest } from "inngest";
import prisma from "../configs/prisma.js";
import sendEmail from "../configs/nodemailer.js";

// Create a client to send and receive events
export const inngest = new Inngest({ id: "project-management" });

//Inngest Function to save user data to a database
const syncUserCreation = inngest.createFunction(
    {id: 'sync-user-from-clerk'},
    {event: 'clerk/user.created'},
    async ({ event }) => {
        const { data } = event;
        await prisma.user.create({
            data: {
                id: data.id,
                email: data?.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
            }
        })
    }
)

//Inngest Function to delete user from database
const syncUserDeletion = inngest.createFunction(
    {id: 'delete-user-with-clerk'},
    {event: 'clerk/user.deleted'},
    async ({ event }) => {
        const { data } = event;
        await prisma.user.delete({
            where: {
                id: data.id,
            }
        })
    }
)

//Inngest Function to update user data in database
const syncUserUpdation = inngest.createFunction(
    {id: 'update-user-from-clerk'},
    {event: 'clerk/user.updated'},
    async ({ event }) => {
        const { data } = event;
        await prisma.user.update({
            where: {
                id: data.id
            },
            data: {
                email: data?.email_addresses[0]?.email_address,
                name: data?.first_name + " " + data?.last_name,
                image: data?.image_url,
            }
        })
    }
)

//Inngest Function to save workspace data to a database
const syncWorkspaceCreation = inngest.createFunction(
    {id: 'sync-workspace-from-clerk'},
    {event: 'clerk/organization.created'},
    async ({ event }) => {
        const { data } = event;
        await prisma.workspace.create({
            data: {
                id: data.id,
                name: data.name,
                slug: data.slug,
                ownerId: data.created_by,
                image_url: data.image_url,
            }
        })

        //Add creator as ADMIN member
        await prisma.workspaceMember.create({
            data: {
                userId: data.created_by,
                workspaceId: data.id,
                role: "ADMIN",
            }
        })
    }
)

//Inngest Function to update workspace data in database
const syncWorkspaceUpdation = inngest.createFunction(
    {id: 'update-workspace-from-clerk'},
    {event: 'clerk/organization.updated'},
    async ({ event }) => {
        const { data } = event;
        await prisma.workspace.update({
            where: {
                id: data.id
            },
            data: {
                name: data.name,
                slug: data.slug,
                image_url: data.image_url,
            }
        })
    }
)

//Inngest Function to delete workspace from database
const syncWorkspaceDeletion = inngest.createFunction(
    {id: 'delete-workspace-with-clerk'},
    {event: 'clerk/organization.deleted'},
    async ({ event }) => {
        const { data } = event;
        await prisma.workspace.delete({
            where: {
                id: data.id,
            }
        })
    }
)

//Inngest Function to save workspace member data to a database
const syncWorkspaceMemberCreation = inngest.createFunction(
    {id: 'sync-workspace-member-from-clerk'},
    {event: 'clerk/organizationInvitation.accepted'},
    async ({ event }) => {
        const { data } = event; 
        await prisma.workspaceMember.create({
            data: {
                userId: data.user_id,
                workspaceId: data.organization_id,
                role: String(data.role_name).toUpperCase(),
            }
        })
    }
)

//Inngest Function to send Email on task creation
const sendTaskAssignmentEmail = inngest.createFunction(
    {id: "send-task-assignment-mail"},
    {event: "app/task.assigned"},
    async ({event, step}) => {
        const {taskId, origin} = event.data;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: { assignee: true, project: true },
        })

        await sendEmail({
            to: task.assignee.email,
            subject: `New Task Assigned: ${task.project.name}`,
            body: `<div style= "max-width: 600px;">
                <h2>Hi ${task.assignee.name}</h2>
                <h2>You have been assigned a new task!</h2>
                <p><strong>Project:</strong> ${task.project.name}</p>
                <p><strong>Task Title:</strong> ${task.title}</p>
                <p><strong>Description:</strong> ${task.description}</p>
                <p><strong>Due Date:</strong> ${new Date(task.due_date).toLocalDateString()} : 'No due date'}</p>
                <a href="${origin}/projects/${task.projectId}/tasks/${task.id}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">View Task</a>
                <p>Best Regards,<br/>Project Management Team</p>
            </div>`
        })

        if(new Date(task.due_date).toLocaleDateString() !== new Date().toDateString()){
            await step.sleepUntil('wait-for-the-due-date', new Date(task.due_date));

            await step.run('check-if-task-is-completed', async () => {
                const task = await prisma.task.findUnique({
                    where: {id: taskId},
                    include: {assignee: true, project: true}
                })

                if(!task) return;

                if(task.status !== "DONE"){
                    await step.run('sned-task-reminder-mail', async () => {
                        await sendEmail({
                            to: task.assignee.email,
                            subject: `Task Reminder: ${task.project.name}`,
                            body: `<div style= "max-width: 600px;">
                                <h2>Hi ${task.assignee.name}</h2>
                                <h2>This is a reminder for your pending task!</h2>
                                <p><strong>Project:</strong> ${task.project.name}</p>
                                <p><strong>Task Title:</strong> ${task.title}</p>
                                <p><strong>Description:</strong> ${task.description}</p>
                                <a href="${origin}/projects/${task.projectId}/tasks/${task.id}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">View Task</a>
                                <p>Best Regards,<br/>Project Management Team</p>
                            </div>`
                        })
                    })
                }
            })
        }
    }
);

// Create an empty array where we'll export future Inngest functions
export const functions = [
    syncUserCreation,
    syncUserDeletion,
    syncUserUpdation,
    syncWorkspaceCreation,
    syncWorkspaceUpdation,
    syncWorkspaceDeletion,
    syncWorkspaceMemberCreation,   
    sendTaskAssignmentEmail
     
];