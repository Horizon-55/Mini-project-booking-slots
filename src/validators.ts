import { z } from 'zod';

export const registerUserSchema = z.object({
    full_name: z.string().min(2, "Ім'я надто коротке"),
    email: z.string().email("Некоректний формат email")
});

export const createBookingSchema = z.object({
    user_id: z.string().uuid("Некоректний ID користувача"),
    workspace_id: z.string().uuid("Некоректний ID робочого місця"),
    start_time: z.string().datetime("Некоректний формат часу"),
    end_time: z.string().datetime("Некоректний формат часу")
});