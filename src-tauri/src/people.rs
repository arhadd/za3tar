// The people directory. Meetings link to a person (meta.json `person`); this
// module owns the contact side — phone and email per person, stored once in
// app_data_dir/people.json — and the aggregated directory view: who you've
// been talking to, how often, and what's still open with them. Contact info
// is what turns a draft into a follow-up: a phone number makes the WhatsApp
// button open that person's chat, an email addresses the recap directly.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Contact {
    #[serde(default)]
    pub phone: String,
    #[serde(default)]
    pub email: String,
    /// company / team they belong to
    #[serde(default)]
    pub org: String,
    /// what they do there
    #[serde(default)]
    pub role: String,
    /// other spellings the transcriber produces ("كريم" for Karim)
    #[serde(default)]
    pub aliases: Vec<String>,
}

/// One row of the directory: a person plus everything the library knows about
/// them.
#[derive(Serialize)]
pub struct PersonRow {
    pub name: String,
    pub phone: String,
    pub email: String,
    pub org: String,
    pub role: String,
    pub aliases: Vec<String>,
    pub meetings: u32,
    pub last_met: u64,
    pub open_actions: u32,
    /// workspaces this person has met in (derived from their meetings)
    pub workspaces: Vec<String>,
}

fn people_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(crate::paths::data_dir(app)?.join("people.json"))
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
                org: c.org.clone(),
                role: c.role.clone(),
                aliases: c.aliases.clone(),
                meetings: 0,
                last_met: 0,
                open_actions: 0,
                workspaces: Vec::new(),
            },
        );
    }

    for rec in crate::library::list_recordings(app.clone())? {
        if rec.person.is_empty() {
            continue;
        }
        // an alias on a contact card folds that spelling into the real person
        let canonical = contacts
            .iter()
            .find(|(_, c)| c.aliases.iter().any(|a| a == &rec.person))
            .map(|(n, _)| n.clone())
            .unwrap_or_else(|| rec.person.clone());
        let row = rows.entry(canonical.clone()).or_insert_with(|| PersonRow {
            name: canonical.clone(),
            phone: String::new(),
            email: String::new(),
            org: String::new(),
            role: String::new(),
            aliases: Vec::new(),
            meetings: 0,
            last_met: 0,
            open_actions: 0,
            workspaces: Vec::new(),
        });
        row.meetings += 1;
        row.last_met = row.last_met.max(rec.created);
        if !row.workspaces.contains(&rec.workspace) {
            row.workspaces.push(rec.workspace.clone());
        }
        if let Some(acts) = crate::actions::load(Path::new(&rec.dir)) {
            row.open_actions += acts.actions.iter().filter(|a| !a.done).count() as u32;
        }
    }

    // most recently met first; contact-only cards last
    let mut out: Vec<PersonRow> = rows.into_values().collect();
    out.sort_by_key(|p| std::cmp::Reverse(p.last_met));
    Ok(out)
}

#[tauri::command]
pub fn save_person(
    app: AppHandle,
    name: String,
    phone: String,
    email: String,
    org: Option<String>,
    role: Option<String>,
    aliases: Option<Vec<String>>,
) -> Result<(), String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("person needs a name".into());
    }
    let mut contacts = read_contacts(&app);
    let prev = contacts.get(&name).cloned().unwrap_or_default();
    contacts.insert(
        name.clone(),
        Contact {
            phone: phone.trim().to_string(),
            email: email.trim().to_string(),
            org: org.map(|s| s.trim().to_string()).unwrap_or(prev.org),
            role: role.map(|s| s.trim().to_string()).unwrap_or(prev.role),
            aliases: aliases
                .map(|v| {
                    v.into_iter()
                        .map(|a| a.trim().to_string())
                        .filter(|a| !a.is_empty() && a != &name)
                        .collect()
                })
                .unwrap_or(prev.aliases),
        },
    );
    let path = people_path(&app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&contacts).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}
