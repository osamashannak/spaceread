import { configureStore } from '@reduxjs/toolkit'
import userReducer from "./slice/user_slice.ts";
import professorReducer from "./slice/professor_slice.ts";
import notificationReducer from "./slice/notification_slice.ts";

const store = configureStore({
    reducer: {
        user: userReducer,
        professor: professorReducer,
        notifications: notificationReducer
    },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export default store;
