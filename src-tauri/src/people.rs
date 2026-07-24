// The people directory. Meetings link to a person (meta.json `person`); this
// module owns the contact side — phone and email per person, stored once in
// app_data_dir/people.json — and the aggregated directory view: who you've
// been talking to, how often, and what's still open with them. Contact info
// is what turns a draft into a follow-up: a phone number makes the WhatsApp
// button open that person's chat, an email addresses the recap directly.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Contact {
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub email: String,
}

/// One row of the directory: a person plus everything the library knows about
/// them.
#[derive(Serialize)]
pub struct PersonRow {
    pub name: String,
    pub phone: String,
    pub email: String,
    pub meetings: u32,
    pub last_met: u64,
    pub open_actions: u32,
}

fn people_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("people.json"))
}

fn read_contacts(app: &AppHandle) -> BTreeMap<String, Contact> {
    people_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// The directory: everyone who has a meeting or a saved contact card.
#[tauri::command]
pub fn list_people(app: AppHandle) -> Result<Vec<PersonRow>, String> {
    let contacts = read_contacts(&app);
    let mut rows: BTreeMap<String, PersonRow> = BTreeMap::new();

    for (name, c) in &contacts {
        rows.insert(
            name.clone(),
            PersonRow {
                name: name.clone(),
                phone: c.phone.clone(),
                email: c.email.clone(),
                meetings: 0,
                last_met: 0,
                open_actions: 0,
            },
        );
    }

    for rec in crate::library::list_recordings(app.clone())? {
        if rec.person.is_empty() {
            continue;
        }
        let row = rows.entry(rec.person.clone()).or_insert_with(|| PersonRow {
            name: rec.person.clone(),
            phone: String::new(),
            email: String::new(),
            meetings: 0,
            last_met: 0,
            open_actions: 0,
        });
        row.meetings += 1;
        row.last_met = row.last_met.max(rec.created);
        if let Some(acts) = crate::actions::load(Path::new(&rec.dir)) {
            row.open_actions += acts.actions.iter().filter(|a| !a.done).count() as u32;
        }
    }

    // most recently met first; contact-only cards last
    let mut out: Vec<PersonRow> = rows.into_values().collect();
    out.sort_by(|a, b| b.last_met.cmp(&a.last_met));
    Ok(out)
}

#[tauri::command]
pub fn save_person(
    app: AppHandle,
    name: String,
    phone: String,
    email: String,
) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("person needs a name".into());
    }
    let mut contacts = read_contacts(&app);
    contacts.insert(
        name,
        Contact {
            phone: phone.trim().to_string(),
            email: email.trim().to_string(),
        },
    );
    let path = people_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&contacts).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}
