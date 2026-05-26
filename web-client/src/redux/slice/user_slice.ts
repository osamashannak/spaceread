import {createSlice} from '@reduxjs/toolkit'

interface UserState {
    id: string,
    username: string,
    role: string,
    status: "guest" | "authenticated" | "loading" | null
}

const initialState: UserState = {
    id: "",
    username: "",
    role: "",
    status: "loading"
}

export const userSlice = createSlice({
    name: 'user',
    initialState,
    reducers: {
        setUser: (state, action) => {
            state.id = action.payload.id ?? ""
            state.username = action.payload.username ?? ""
            state.role = action.payload.role ?? ""
            state.status = action.payload.status ?? "guest"
        },
        clearUser: (state) => {
            state.id = ""
            state.username = ""
            state.role = ""
            state.status = "guest"
        }
    }
})

export const { setUser, clearUser } = userSlice.actions

export default userSlice.reducer
