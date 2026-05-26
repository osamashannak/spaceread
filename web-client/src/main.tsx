import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.scss'
import {RouterProvider} from "react-router-dom";
import Router from "./router/default.tsx";
import store from "./redux/store.ts";
import {Provider} from "react-redux";
import {HelmetProvider} from "@dr.pogodin/react-helmet";
import * as Sentry from "@sentry/react";

Sentry.init({
    dsn: "https://b5d6c7156ec8549a355faab8bec60b5d@o4510010116341760.ingest.de.sentry.io/4510010117980240",
    integrations: [
        Sentry.browserTracingIntegration()
    ],
    tracePropagationTargets: [
        /^https:\/\/professor\.api\.spaceread\.net\/.*/,
        /^https:\/\/course\.api\.spaceread\.net\/.*/,
        /^https:\/\/auth\.api\.spaceread\.net\/.*/
    ],
    tracesSampleRate: 0.1
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Provider store={store}>
            <HelmetProvider>
                <RouterProvider router={Router}/>
            </HelmetProvider>
        </Provider>
    </React.StrictMode>,
)
