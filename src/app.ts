import 'reflect-metadata';
import 'source-map-support/register'
import express from "express";
import { plainToClass } from 'class-transformer';
import { Zone, Source, Scenario, Ramp } from './model';
import { runEmulator } from './emulator';

const log = require("loglevel");
const cors = require('cors');
const fs = require('fs');
const SerialPort = require("serialport");
const Readline = require('@serialport/parser-readline');

const BaudRate = parseInt(process.env.BAUDRATE || "9600");
const device = process.env.DEVICE || "COM4";
const serial = new SerialPort(device, {
    baudRate: BaudRate,
});
const app = express();
app.use(cors());
app.use(express.json());
const port = 3000;
const rampInterval = parseInt(process.env.RAMPTIME || "250");
const parser = serial.pipe(new Readline({ delimiter: "\n", encoding: "ascii" }));

const writeSerial = (line) => {
    log.info("Sent", line);
    serial.write(line+"\n");
};

parser.on('data', function (data) {
    log.info("Received ", data);
    if (data.startsWith('Command Error.')) {
        process.exit(1);
    }
    const zone = data.toString("ascii").match(/>(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (zone != null) {
        let newZone: Zone = {
            "id":          parseInt(zone[1]),
            "name":        "Name",
            "description": "",
            "pa":          zone[2] == "01",
            "power":       zone[3] == "01",
            "mute":        zone[4] == "01",
            "dnd":         zone[5] == "01",
            "volume":      parseInt(zone[6]),
            "treble":      parseInt(zone[7]),
            "bass":        parseInt(zone[8]),
            "balance":     parseInt(zone[9]),
            "source":      parseInt(zone[10])
        };
        let existing = zones.find(z => z.id == newZone.id);
        if (existing) {
            Object.assign(existing, newZone);
        } else {
            zones.push(newZone);
        }
        fs.writeFileSync('src/zones.json', JSON.stringify(zones, null, 4));
    }
});
const readZones = () => {
    for (let amp = 1; amp <= 3; ++amp) {
        writeSerial(`?${amp}0`);
    }
}
serial.on("open", function () {
    console.log(`Listening on port ${device}`);
    readZones();
});

function set(obj: any, attribute: string, value: any): any {
    obj[attribute] = value;
    return obj;
}

let zones: Zone[]         = JSON.parse(fs.readFileSync('src/zones.json'    )).map(x => plainToClass(Zone,     x));
let sources: Source[]     = JSON.parse(fs.readFileSync('src/sources.json'  )).map(x => plainToClass(Source,   x));
let scenarios: Scenario[] = JSON.parse(fs.readFileSync('src/scenarios.json')).map(x => plainToClass(Scenario, x));

function pad(s: any): string {
    return ("00"+s).slice(-2);
}

function sanitizeName(name: string): string {
    // TODO
    return "test    ";
}

function writeAttribute(id: number, attribute: string, value: boolean | number) {
    let zone = getZone(id);
    switch (attribute) {
        case "power":
            value = zone.power = !!value;
            writeSerial(`<${id}PR${value ? "01" : "00"}`);
            break;
        case "pa":
            value = zone.pa = !!value;
            writeSerial(`<${id}PA${value ? "01" : "00"}`);
            break;
        case "mute":
            value = zone.mute = !!value;
            writeSerial(`<${id}MU${value ? "01" : "00"}`);
            break;
        case "dnd":
            value = zone.dnd = !!value;
            writeSerial(`<${id}DT${value ? "01" : "00"}`);
            break;
        case "volume":
            value = zone.volume = Math.max(0, Math.min(38, value as number));
            writeSerial(`<${id}VO${pad(value)}`);
            break;
        case "treble":
            value = zone.treble = Math.max(0, Math.min(14, value as number));
            writeSerial(`<${id}TR${pad(value)}`);
            break;
        case "bass":
            value = zone.bass = Math.max(0, Math.min(14, value as number));
            writeSerial(`<${id}BS${pad(value)}`);
            break;
        case "balance":
            value = zone.balance = Math.max(0, Math.min(20, value as number));
            writeSerial(`<${id}BL${pad(value)}`);
            break;
        case "source":
            value = zone.source = Math.max(1, Math.min(6, value as number));
            writeSerial(`<${id}CH${pad(value)}`);
            break;
        default: return;
    }
}

function updateZones(delta: Partial<Zone>[]) {
    for (let dZone of delta) {
        for (let attribute of Object.keys(dZone)) {
            writeAttribute(dZone.id, attribute, dZone[attribute]);
        }
    }
    fs.writeFileSync('src/zones.json', JSON.stringify(zones, null, 4));
}

function updateSources(delta: Partial<Source>[]) {
    for (let dSource of delta) {
        if (dSource["name"] !== undefined) {
            writeSerial(`${dSource.id}<${sanitizeName(dSource.name)}`);
            getSource(dSource.id).name = dSource.name;
        }
    }
    fs.writeFileSync('src/sources.json', JSON.stringify(sources, null, 4));
}

function updateScenarios(delta: Partial<Scenario>[]) {
    for (let dScenario of delta) {
        Object.assign(getScenario(dScenario.id), dScenario);
    }
    fs.writeFileSync('src/scenarios.json', JSON.stringify(scenarios, null, 4));
}

function fail(message: string): never {
    throw new Error(message);
}

function getZone(id: number): Zone {
    return zones.find(z => z?.id == id) || fail(`Zone not found: ${id}`);
}

function getSource(id: number): Source {
    return sources.find(s => s?.id == id) || fail(`Source not found: ${id}`);
}

function getScenario(id: number): Scenario {
    return scenarios.find(s => s?.id == id) || fail(`Scenario not found: ${id}`);
}

function paramRegex(param: string, regex: RegExp, fn: () => { id:number }[] = null) {
    app.param(param, (req, res, next, value) => {
        if (value.match(regex)) {
            if (req.method == "GET" && fn !== null && !fn().find(x => x && x.id == value)) {
                next(new Error(`${param} with id ${value} not found`));
            } else {
                next();
            }
        } else {
            next(new Error(`Invalid ${param}: ${value}`));
        }
    });
}

paramRegex('zone',      /^[1-3][0-6]$/, () => zones);
paramRegex('attribute', /^(pa|power|mute|dnd|volume|treble|bass|balance|source)$/);
paramRegex('source',    /^0[0-6]$/, () => sources);
paramRegex('scenario',  /^\d+$/, () => scenarios);


let ramps: Ramp[] = [];
let rampTimer: NodeJS.Timer;

function rampTick() {
    updateZones(ramps.map(r => r.next(getZone(r.id))));
    ramps = ramps.filter(r => !r.finished);
    if (!ramps.length) {
        clearInterval(rampTimer);
        rampTimer = null;
    }
}

function startRampTimer() {
    if (!rampTimer) {
        rampTimer = setInterval(rampTick, rampInterval);
    }
}

function startRamp(ramp: Ramp) {
    let existing = ramps.find((r) => r?.id == ramp.id);
    if (existing) {
        existing.merge(ramp);
    } else {
        ramps.push(ramp);
        startRampTimer();
    }
}
function stopRamp(ramp: Ramp) {
    let existing = ramps.find((r) => r?.id == ramp.id);
    if (existing) {
        existing.stop(ramp);
    }
}


///////////////////////////////////////////////////////////////////////////////
///  Zones
///////////////////////////////////////////////////////////////////////////////
app.get('/api/zones', (req, res) => {
    res.json(zones.filter(z => z));
});
app.get('/api/zones/:zone', (req, res) => {
    res.json(getZone(parseInt(req.params.zone)));
});
app.get('/api/zones/:zone/:attribute', (req, res) => {
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});

app.post('/api/zones/reload', (req, res) => {
    zones = [];
    readZones();
    res.json(zones.filter(z => z));
});
app.post('/api/zones', (req, res) => {
    updateZones(req.body);
    res.json(zones.filter(z => z));
});
app.post('/api/zones/:zone', (req, res) => {
    updateZones([set(req.body, "id", req.params.zone)]);
    res.json(getZone(parseInt(req.params.zone)));
});
app.post('/api/zones/:zone/:attribute', (req, res) => {
    updateZones([set({ id: req.params.zone }, req.params.attribute, req.body)]);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/up', (req, res) => {
    let old = getZone(parseInt(req.params.zone))[req.params.attribute];
    updateZones([set({ id: req.params.zone }, req.params.attribute, old + (req.body || 1))]);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/down', (req, res) => {
    let old = getZone(parseInt(req.params.zone))[req.params.attribute];
    updateZones([set({ id: req.params.zone }, req.params.attribute, old - (req.body || 1))]);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/rampup', (req, res) => {
    let ramp = new Ramp(parseInt(req.params.zone), req.params.attribute, 100, 1);
    startRamp(ramp);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/rampdown', (req, res) => {
    let ramp = new Ramp(parseInt(req.params.zone), req.params.attribute, 0, -1);
    startRamp(ramp);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/:attribute/rampstop', (req, res) => {
    let ramp = new Ramp(parseInt(req.params.zone), req.params.attribute, 0, 0);
    stopRamp(ramp);
    res.json(getZone(parseInt(req.params.zone))[req.params.attribute]);
});
app.post('/api/zones/:zone/source/next', (req, res) => {
    let old = getZone(parseInt(req.params.zone)).source;
    for (let i = 1; i <= 6; ++i) {
        let idx = (old + i - 1) % 6 + 1;
        if (sources[idx].enabled) {
            updateZones([{ id: parseInt(req.params.zone), source: idx }]);
            res.json(idx);
            break;
        }
    }
});
app.post('/api/zones/:zone/source/previous', (req, res) => {
    let old = getZone(parseInt(req.params.zone)).source;
    for (let i = 0; i < 6; ++i) {
        let idx = (old + 6 - i - 1) % 6 + 1;
        if (sources[idx].enabled) {
            updateZones([{ id: parseInt(req.params.zone), source: idx }]);
            res.json(idx);
            break;
        }
    }
});


///////////////////////////////////////////////////////////////////////////////
///  Sources
///////////////////////////////////////////////////////////////////////////////
app.get('/api/sources', (req, res) => {
    res.json(sources.filter(z => z));
});
app.get('/api/sources/:source', (req, res) => {
    res.json(getSource(parseInt(req.params.source)));
});
app.post('/api/sources', (req, res) => {
    updateSources(req.body);
    res.json(sources.filter(z => z));
});
app.post('/api/sources/:source', (req, res) => {
    updateSources([set(req.body, "id", parseInt(req.params.source))]);
    res.json(getSource(parseInt(req.params.source)));
});



///////////////////////////////////////////////////////////////////////////////
///  Scenarios
///////////////////////////////////////////////////////////////////////////////
app.get('/api/scenarios', (req, res) => {
    res.json(scenarios.filter(z => z));
});
app.get('/api/scenarios/:scenario', (req, res) => {
    res.json(getScenario(parseInt(req.params.scenario)));
});
app.post('/api/scenarios', (req, res) => {
    updateScenarios(req.body);
    res.json(scenarios.filter(z => z));
});
app.post('/api/scenarios/:scenario', (req, res) => {
    updateScenarios([set(req.body, "id", parseInt(req.params.scenario))]);
    res.json(getScenario(parseInt(req.params.scenario)));
});
app.post('/api/scenarios/:scenario/engage', (req, res) => {
    let scenario = getScenario(parseInt(req.params.scenario));
});
app.delete('/api/scenarios/:scenario', (req, res) => {
    scenarios = scenarios.filter(s => s.id != parseInt(req.params.scenario));
    res.json(scenarios);
});

app.listen(port, () => {
    if (process.argv[2] == 'test') {
        log.setLevel("info");
        runEmulator(2);
    }
    return console.log(`server is listening on ${port}`);
});