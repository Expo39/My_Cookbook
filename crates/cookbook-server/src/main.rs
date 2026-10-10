use std::{io::Read, net::SocketAddr, process::ExitCode, sync::Arc};

use cookbook_server::{AppState, Gemini, HttpGemini, auth, config::Config, router};

fn hash_password_from_stdin() -> ExitCode {
    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        eprintln!("cannot read the password from standard input");
        return ExitCode::FAILURE;
    }
    let password = input.trim_end_matches(['\r', '\n']);
    if password.is_empty() {
        eprintln!(
            "the password is empty; pipe it in, e.g. printf '%s' 'my password' | cookbook-server --hash-password"
        );
        return ExitCode::FAILURE;
    }
    match auth::hash_password(password) {
        Ok(hash) => {
            println!("{hash}");
            ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("cannot hash the password: {error}");
            ExitCode::FAILURE
        }
    }
}

async fn shutdown() {
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {},
        () = terminate => {},
    }
}

async fn run() -> Result<(), String> {
    let config = Config::from_lookup(|name| std::env::var(name).ok())?;
    let gemini: Option<Arc<dyn Gemini>> = match &config.gemini_key {
        Some(key) => Some(Arc::new(HttpGemini::new(
            key.clone(),
            config.gemini.model.clone(),
        )?)),
        None => None,
    };
    let bind = config.bind.clone();
    let state =
        AppState::new(config, gemini).map_err(|e| format!("cannot read the recipes: {e}"))?;
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .map_err(|e| format!("cannot listen on {bind}: {e}"))?;
    eprintln!("listening on {bind}");
    axum::serve(
        listener,
        router(state).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await
    .map_err(|e| e.to_string())
}

#[tokio::main]
async fn main() -> ExitCode {
    match std::env::args().nth(1).as_deref() {
        Some("--hash-password") => return hash_password_from_stdin(),
        Some("--help" | "-h") => {
            println!("cookbook-server: configured through the environment, see docs/DEPLOYMENT.md");
            println!(
                "  --hash-password   read a password from standard input and print its argon2id hash"
            );
            return ExitCode::SUCCESS;
        }
        _ => {}
    }
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}
