# GLM50C BLE → Plan UI (FastAPI + Canvas)

Prototype: connexion BLE au télémètre **Bosch GLM 50 C**, réception des mesures en **mètres**, affichage en temps réel dans une UI web (canvas) permettant de tracer un plan et d’exporter en JPG.

## Fonctionnalités (MVP)
- Scan + connexion BLE au GLM50C
- Activation AutoSync (write) + réception des indications (indicate)
- Parsing des trames: distance en mètres (float32 little-endian, offset 7..10 pour subtype 0x06)
- UI web:
  - affichage dernière mesure
  - création de segments contraints à la dernière mesure
  - export JPG du canvas
- Endpoint de santé: `/health`
- WebSocket: `/ws` (messages `measure` et `ble_status`)

## Prérequis
- Windows 11 (testé)
- Python >= 3.10 (recommandé: 3.12 pour stabilité BLE)
- Bluetooth activé
- GLM50C à proximité

## Installation
```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\activate

python -m pip install -U pip setuptools wheel
pip install -e .

Lancer l’application (UI)
python -m uvicorn planui.main:app --reload --host 127.0.0.1 --port 8000


Puis ouvrir:

http://127.0.0.1:8000

Vérifier l’état

http://127.0.0.1:8000/health

Test BLE (scripts)

Dossier tests/

Dump services GATT du GLM
python .\tests\glm_dump.py

Capture mesures (AutoSync + indications)
python .\tests\glm_capture_autosync.py

Notes BLE (GLM50C)

Service: 00005301-0000-0041-5253-534f46540000

Characteristic: 00004301-0000-0041-5253-534f46540000 (write + indicate)

AutoSyncEnable: C0 55 02 01 00 1A

Roadmap (idées)

Pan/zoom + grille + snap

Édition: sélectionner segment, modifier longueur, annuler/refaire

Sauvegarde/restauration du plan (JSON)

Export PNG + JPG + PDF

Mode “pièce” (polygone fermé) et calcul surface