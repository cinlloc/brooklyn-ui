/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {Issue} from './issue.model';
import {Dsl, DslParser} from './dsl.model';

const MEMBERSPEC_REGEX = /^(\w+\.)*[mM]ember[sS]pec$/;
const FIRST_MEMBERSPEC_REGEX = /^(\w+\.)*first[mM]ember[sS]pec$/;
// TODO ideally we'd just look at type EntitySpec, not key name, but for now look at keyname, anything ending memberSpec
const ANY_MEMBERSPEC_REGEX = /^(\w+\.?)*[mM]ember[sS]pec$/;
const RESERVED_KEY_REGEX = /(^children$|^services$|^locations?$|^brooklyn\.config$|^brooklyn\.enrichers$|^brooklyn\.policies$)/;
const FIELD = {
    SERVICES: 'services', CHILDREN: 'brooklyn.children', CONFIG: 'brooklyn.config', LOCATION: 'location',
    POLICIES: 'brooklyn.policies', ENRICHERS: 'brooklyn.enrichers', TYPE: 'type', NAME: 'name', ID: 'id',
    // This field is not part of the Brooklyn blueprint spec but used to store information about the composer, e.g. X,Y coordinates, virtual items, etc
    COMPOSER_META: 'brooklyn.composer.metadata'
};
const UNSUPPORTED_CATALOG_FIELDS = ['brooklyn.catalog', 'items', 'item'];
const UNSUPPORTED_FIELDS = {
    locations: 'Multi-locations is not supported in the blueprint composer. Please use [location] instead'
};
export const EntityFamily = {
    ENTITY: {id: 'ENTITY', displayName: 'Entity', superType: 'org.apache.brooklyn.api.entity.Entity'},
    LOCATION: {id: 'LOCATION', displayName: 'Location', superType: 'org.apache.brooklyn.api.location'},
    POLICY: {id: 'POLICY', displayName: 'Policy', superType: 'org.apache.brooklyn.api.policy.Policy'},
    ENRICHER: {id: 'ENRICHER', displayName: 'Enricher', superType: 'org.apache.brooklyn.api.sensor.Enricher'},
    SPEC: {id: 'SPEC', displayName: 'Spec', superType: 'org.apache.brooklyn.api.entity.EntitySpec'}
};

export const PREDICATE_MEMBERSPEC = (config, entity)=>(config.name.match(MEMBERSPEC_REGEX));
export const PREDICATE_FIRST_MEMBERSPEC = (config, entity)=>(config.name.match(FIRST_MEMBERSPEC_REGEX));

const DSL = {ENTITY_SPEC: '$brooklyn:entitySpec'};
const ID = new WeakMap();
const PARENT = new WeakMap();
const METADATA = new WeakMap();
const CONFIG = new WeakMap();
const CHILDREN = new WeakMap();
const LOCATIONS = new WeakMap();
const POLICIES = new WeakMap();
const ENRICHERS = new WeakMap();
const MISC_DATA = new WeakMap();

/**
 *
 * @param {string} value
 * @returns {boolean}
 */
const NOT_EMPTY = function (value) {
    return (typeof value !== 'undefined' && value !== null && value.length > 0);
};

export class Entity {
    constructor() {
        ID.set(this, Math.random().toString(36).slice(2));
        CONFIG.set(this, new Map());
        METADATA.set(this, new Map());
        ENRICHERS.set(this, new Map());
        POLICIES.set(this, new Map());
        CHILDREN.set(this, new Array());
        MISC_DATA.set(this, new Map());
        MISC_DATA.get(this).set('issues', []);
        this.family = EntityFamily.ENTITY.id;
        this.touch();
    }

    /**
     * The internal entity id
     * @returns {string}
     */
    get _id() {
        return ID.get(this);
    }


    /**
     * The external entity if set
     * @returns {string}
     */
    get id() {
        return METADATA.get(this).get(FIELD.ID) || null;
    }

    /**
     * Set the external id (NOTE:: This does not effect the value of the internal id `_id`)
     * @param {string} id
     */
    set id(id) {
        METADATA.get(this).set(FIELD.ID, id);
        this.touch();
    }

    /**
     * @returns {boolean}
     */
    hasId() {
        return METADATA.get(this).has(FIELD.ID) && NOT_EMPTY(METADATA.get(this).get(FIELD.ID));
    }

    /**
     *
     */
    touch() {
        // include a summary to aid with debugging (otherwise log just shows the property lastUpdated)
        this.summary = (this.type || "unset") + (this.id ? " "+this.id : "");
        this.lastUpdated = new Date().getTime();
        if (this.hasParent()) {
            this.parent.touch();
        }
    }

    /**
     * Has type been set
     * @returns {boolean}
     */
    hasType() {
        return METADATA.get(this).has(FIELD.TYPE) && NOT_EMPTY(METADATA.get(this).get(FIELD.TYPE));
    }

    /**
     * Get {Entity} type
     * @returns {string}
     */
    get type() {
        return METADATA.get(this).get(FIELD.TYPE);
    }

    /**
     * Set {Entity} type
     * @param {string} type
     */
    set type(type) {
        if (NOT_EMPTY(type)) {
            METADATA.get(this).set(FIELD.TYPE, type);
            this.touch();
        }
    }

    /**
     * Get {Entity} type version
     * @returns {string}
     */
    get version() {
        return MISC_DATA.get(this).get('version');
    }

    /**
     * Set {Entity} type version
     * @param {string} version
     */
    set version(version) {
        MISC_DATA.get(this).set('version', version);
    }

    /**
     * @returns {boolean}
     */
    hasVersion() {
        return MISC_DATA.get(this).has('version');
    }

    /**
     * Has name been set
     * @returns {boolean}
     */
    hasName() {
        return METADATA.get(this).has(FIELD.NAME) && NOT_EMPTY(METADATA.get(this).get(FIELD.NAME));
    }

    /**
     * Get {Entity} name
     * @returns {string}
     */
    get name() {
        return METADATA.get(this).get(FIELD.NAME);
    }

    /**
     * Set {Entity} name
     * @param {string} name
     */
    set name(name) {
        METADATA.get(this).set(FIELD.NAME, name);
        this.touch();
    }

    /**
     * Get {Entity} family
     * @returns {string}
     */
    get family() {
        return MISC_DATA.get(this).get('family');
    }

    /**
     * Set {Entity} family
     * @param {string} familyId
     */
    set family(familyId) {
        switch (familyId) {
            case EntityFamily.ENRICHER.id:
                MISC_DATA.get(this).set('family', EntityFamily.ENRICHER);
                break;
            case EntityFamily.POLICY.id:
                MISC_DATA.get(this).set('family', EntityFamily.POLICY);
                break;
            case EntityFamily.SPEC.id:
                MISC_DATA.get(this).set('family', EntityFamily.SPEC);
                break;
            case EntityFamily.ENTITY.id:
            default:
                MISC_DATA.get(this).set('family', EntityFamily.ENTITY);
        }
    }

    /**
     * Has {Entity} icon been set
     * @returns {boolean}
     */
    hasIcon() {
        return MISC_DATA.get(this).has('icon') && NOT_EMPTY(MISC_DATA.get(this).get('icon'));
    }

    /**
     * Get {Entity} icon
     * @returns {string}
     */
    get icon() {
        return MISC_DATA.get(this).get('icon');
    }

    /**
     * Set {Entity} type
     * @param {string} icon
     */
    set icon(icon) {
        if (NOT_EMPTY(icon)) {
            MISC_DATA.get(this).set('icon', icon);
            this.touch();
        }
    }

    /**
     * Get {Entity} location
     * @returns {string}
     */
    get location() {
        return LOCATIONS.get(this);
    }

    /**
     * Set {Entity} location
     * @param {string} location
     */
    set location(location) {
        LOCATIONS.set(this, location);
        this.touch();
    }

    /**
     * Remove {Entity} location
     * @returns {string}
     */
    removeLocation() {
        LOCATIONS.delete(this);
        this.touch();
    }

    /**
     * Get {Entity} parent
     * @returns {Entity}
     */
    get parent() {
        return PARENT.get(this);
    }


    /**
     * Set {Entity} parent
     * @param {Entity} parent
     */
    set parent(parent) {
        if (parent instanceof Entity) {
            if (PARENT.get(this) !== parent) {
                PARENT.set(this, parent);
                this.touch();
            }
        } else {
            throw new Error('Cannot add parent ... parent must be of type Entity');
        }
    }

    get children() {
        return CHILDREN.get(this);
    }

    get childrenAsMap() {
        return CHILDREN.get(this).reduce((map, child) => {
            map.set(child._id, child);
            return map;
        }, new Map());
    }

    get config() {
        return CONFIG.get(this);
    }

    get metadata() {
        return METADATA.get(this);
    }

    get issues() {
        return MISC_DATA.get(this).get('issues');
    }

    /**
     * Add child {Entity}
     * @param {Entity} child
     * @returns {Entity}
     */
    addChild(child) {
        if (child instanceof Entity) {
            child.parent = this;
            CHILDREN.get(this).push(child);
            this.touch();
            return this;
        } else {
            throw new Error('Cannot add child ... child must be of type Entity');
        }
    }

    /**
     * Insert child {Entity} at a given position
     * @param {Entity} child
     * @param {number} index, zero-based
     * @return {Entity}
     */
    insertChild(child, index) {
        if (child instanceof Entity) {
            if (index < 0 || index > CHILDREN.get(this).length) {
                throw new Error('Cannot insert child ... invalid index value ' + index);
            }
            child.parent = this;
            CHILDREN.get(this).splice(index, 0, child);
            this.touch();
            return this;
        } else {
            throw new Error('Cannot insert child ... child must be of type Entity');
        }
    }

    addEnricher(enricher) {
        if (enricher instanceof Entity) {
            enricher.parent = this;
            enricher.family = EntityFamily.ENRICHER.id;
            ENRICHERS.get(this).set(enricher._id, enricher);
            this.touch();
            return this;
        } else {
            throw new Error('Cannot add enricher ... enricher must be of type Entity');
        }
    }

    addNewEnricher() {
        let newEnricher = new Entity();
        this.addEnricher(newEnricher);
        return newEnricher;
    }

    removeEnricher(id) {
        ENRICHERS.get(this).delete(id);
        this.touch();
        return this;
    }

    addPolicy(policy) {
        if (policy instanceof Entity) {
            policy.parent = this;
            policy.family = EntityFamily.POLICY.id;
            POLICIES.get(this).set(policy._id, policy);
            this.touch();
            return this;
        } else {
            throw new Error('Cannot add policy ... policy must be of type policy');
        }
    }

    addNewPolicy() {
        let newPolicy = new Entity();
        this.addPolicy(newPolicy);
        return newPolicy;
    }

    removePolicy(id) {
        POLICIES.get(this).delete(id);
        this.touch();
        return this;
    }

    /**
     * Remove child
     * @param {string} id
     * @returns {Entity}
     */
    removeChild(id) {
        if (this.hasChildren()) {
            let childIndex = CHILDREN.get(this)
                .filter(e => e._id === id)
                .map(e => CHILDREN.get(this).indexOf(e));
            if (childIndex.length > 0) {
                let removed = CHILDREN.get(this).splice(childIndex[0], 1);
                PARENT.delete(removed[0]);
                this.touch();
            }
        }
        return this;
    }

    /**
     * Has {Entity} got another Entity as an ancestor
     * @param entity
     * @return {boolean} <code>true</code> if the given entity is an ancestor of this
     */
    hasAncestor(entity) {
        if (this === entity) {
            return true;
        }
        else if (this.hasParent()) {
            return this.parent.hasAncestor(entity);
        }
        else {
            return false;
        }
    }

    /**
     * Has {Entity} got a parent
     * @returns {boolean}
     */
    hasParent() {
        return PARENT.has(this);
    }

    /**
     * Has {Entity} got children
     * @returns {boolean}
     */
    hasChildren() {
        return CHILDREN.get(this).length > 0;
    }

    /**
     * Has {Entity} got config
     * @returns {boolean}
     */
    hasConfig() {
        return CONFIG.get(this).size > 0;
    }

    /**
     * Has {Entity} got a location
     * @returns {boolean}
     */
    hasLocation() {
        return LOCATIONS.has(this);
    }

    /**
     * Has {Entity} got policies
     * @returns {boolean}
     */
    hasPolicies() {
        return POLICIES.get(this).size > 0;
    }

    /**
     * Has {Entity} got enrichers
     * @returns {boolean}
     */
    hasEnrichers() {
        return ENRICHERS.get(this).size > 0;
    }

    //NEW

    get metadata() {
        return METADATA.get(this);
    }

    get enrichers() {
        return ENRICHERS.get(this);
    }

    getEnrichersAsArray() {
        return Array.from(ENRICHERS.get(this).values());
    }

    get policies() {
        return POLICIES.get(this);
    }

    getPoliciesAsArray() {
        return Array.from(POLICIES.get(this).values());
    }

    get miscData() {
        return MISC_DATA.get(this);
    }

    equals(value) {
        if (value && value instanceof Entity) {
            try {
                return (this.getData(true) === value.getData(true));
            } catch (err) {
            }
        }
        return false;
    }

    toString() {
        return 'Entity :: id = [' + this._id + ']' + (this.hasType() ? ' type = [' + this.type + ']' : '');
    }
}

Entity.prototype.setEntityFromJson = setEntityFromJson;
Entity.prototype.setChildrenFromJson = setChildrenFromJson;

Entity.prototype.getConfigAsJson = getConfigAsJson;
Entity.prototype.setConfigFromJson = setConfigFromJson;

Entity.prototype.getMetadataAsJson = getMetadataAsJson;
Entity.prototype.setMetadataFromJson = setMetadataFromJson;

Entity.prototype.setEnrichersFromJson = setEnrichersFromJson;
Entity.prototype.setPoliciesFromJson = setPoliciesFromJson;

Entity.prototype.getData = getData;
Entity.prototype.addConfig = addConfig;
Entity.prototype.addMetadata = addMetadata;
Entity.prototype.removeConfig = removeConfig;
Entity.prototype.removeMetadata = removeMetadata;
Entity.prototype.isCluster = isCluster;
Entity.prototype.setClusterMemberspecEntity = setClusterMemberspecEntity;
Entity.prototype.getClusterMemberspecEntity = getClusterMemberspecEntity;
Entity.prototype.getClusterMemberspecEntities = getClusterMemberspecEntities;
Entity.prototype.getInheritedLocation = getInheritedLocation;
Entity.prototype.hasInheritedLocation = hasInheritedLocation;
Entity.prototype.addIssue = addIssue;
Entity.prototype.hasIssues = hasIssues;
Entity.prototype.clearIssues = clearIssues;
Entity.prototype.resetIssues = resetIssues;
Entity.prototype.delete = deleteEntity;
Entity.prototype.reset = resetEntity;

/**
 * Add an entry to brooklyn.config
 * @param {string} key
 * @param {*} value
 * @returns {Entity}
 */
function addConfig(key, value) {
    if (ANY_MEMBERSPEC_REGEX.test(key) && value.hasOwnProperty(DSL.ENTITY_SPEC)) {
        if (value[DSL.ENTITY_SPEC] instanceof Entity) {
            value[DSL.ENTITY_SPEC].family = EntityFamily.SPEC.id;
            value[DSL.ENTITY_SPEC].parent = this;
            CONFIG.get(this).set(key, value);
        } else {
            var entity = new Entity().setEntityFromJson(value[DSL.ENTITY_SPEC]);
            entity.family = EntityFamily.SPEC.id;
            entity.parent = this;
            CONFIG.get(this).set(key, {'$brooklyn:entitySpec': entity});
        }
        this.touch();
        return this;
    } else {
        CONFIG.get(this).set(key, value);
        this.touch();
        return this;
    }
}

function addMetadata(key, value) {
    if (!RESERVED_KEY_REGEX.test(key)) {
        METADATA.get(this).set(key, value);
        this.touch();
    } else {
        // TODO inject $log service
        console.log("Cannot add metadata for reserved word", key, value);
    }
    return this;
}

/**
 * Remove an entry from brooklyn.config
 * @param {string} key
 * @returns {Entity}
 */
function removeConfig(key) {
    CONFIG.get(this).delete(key);
    this.touch();
    return this;
}

/**
 * Remove an entry from the entity metadata
 * @param {string} key
 * @returns {Entity}
 */
function removeMetadata(key) {
    METADATA.get(this).delete(key);
    this.touch();
    return this;
}

/**
 *
 * @returns {boolean}
 */
function isCluster() {
    if (!MISC_DATA.get(this).has('traits')) {
        return false;
    }
    let traits = MISC_DATA.get(this).get('traits');
    return traits && traits.filter((trait)=> {
        return ['org.apache.brooklyn.entity.group.Cluster',
                'org.apache.brooklyn.entity.group.Fabric']
                .indexOf(trait) !== -1
    }).length > 0;
}

/**
 * Returns a map of <configkey> => Entity of all spec {Entity} defined in the configuration
 * @returns {*}
 */
function getClusterMemberspecEntities() {
    if (!MISC_DATA.get(this).has('config')) {
        return {};
    }
    return MISC_DATA.get(this).get('config')
        .filter((config)=>(config.type === 'org.apache.brooklyn.api.entity.EntitySpec'))
        .reduce((acc, config)=> {
            if (CONFIG.get(this).has(config.name)) {
                acc[config.name] = CONFIG.get(this).get(config.name)[DSL.ENTITY_SPEC];
            }
            return acc;
        }, {});
}

/**
 * Returns the first memberspec that matches the given predicate
 *
 * @param predicate A predicate function to filter the results. it takes the config key definition and the entity as parameters
 * @returns {Entity}
 */
function getClusterMemberspecEntity(predicate = ()=>(true)) {
    if (!MISC_DATA.get(this).has('config')) {
        return undefined;
    }

    return MISC_DATA.get(this).get('config')
        .filter((config)=>(config.type === 'org.apache.brooklyn.api.entity.EntitySpec'))
        .reduce((acc, config)=> {
            if (CONFIG.get(this).has(config.name) && predicate(config, CONFIG.get(this).get(config.name)[DSL.ENTITY_SPEC])) {
                return CONFIG.get(this).get(config.name)[DSL.ENTITY_SPEC];
            }
            return acc;
        }, undefined);
}

function setClusterMemberspecEntity(key, entity) {
    if (!MISC_DATA.get(this).has('config')) {
        return this;
    }
    let definition = MISC_DATA.get(this).get('config')
        .filter((config)=>(config.type === 'org.apache.brooklyn.api.entity.EntitySpec' && config.name === key));
    if (definition.length !== 1) {
        return this;
    }
    if (entity instanceof Entity) {
        let value = {};
        value[DSL.ENTITY_SPEC] = entity;
        this.addConfig(key, value);
        this.touch();
    }
    return this;
}

/**
 * Retrieve the {Entity} as JSON
 * @param {boolean} includeChildren
 * @returns {{}}
 */
function getData(includeChildren = true) {
    if (!ID.has(this)) { // Entity has already been garbage collected
        return {};
    }

    var result = this.getMetadataAsJson();
    if (this.hasConfig()) {
        result[FIELD.CONFIG] = this.getConfigAsJson();
    }
    if (this.hasLocation()) {
        result.location = LOCATIONS.get(this);
    }
    if (this.hasChildren() && includeChildren) {
        var children = [];
        for (let child of CHILDREN.get(this).values()) {
            children.push(child.getData());
        }
        if (this.hasParent()) {
            result[FIELD.CHILDREN] = children;
        } else {
            result[FIELD.SERVICES] = children;
        }
    }
    if (this.hasPolicies()) {
        var policies = [];
        for (let policy of POLICIES.get(this).values()) {
            policies.push(policy.getData());
        }
        result[FIELD.POLICIES] = policies;
    }
    if (this.hasEnrichers()) {
        var enrichers = [];
        for (let enricher of ENRICHERS.get(this).values()) {
            enrichers.push(enricher.getData());
        }
        result[FIELD.ENRICHERS] = enrichers;
    }

    return deepMerge(result, this.miscData.get('virtual'));
}

/**
 * Retrieve the inherited location coming from any parent {Entity}. Returns null if any.
 * @returns {string}
 */
function getInheritedLocation() {
    if (this.hasParent()) {
        if (this.parent.hasLocation()) {
            return this.parent.miscData.get('locationName') || this.parent.location;
        } else {
            return this.parent.getInheritedLocation();
        }
    }
    return null;
}

/**
 * Returns true if the current {Entity} has an inherited location coming from any parent {Entity}.
 * @returns {boolean}
 */
function hasInheritedLocation() {
    return this.getInheritedLocation() !== null;
}

function addIssue(issue) {
    if (issue instanceof Issue) {
        this.issues.push(issue);
        this.touch();
    }
    return this;
}

function hasIssues() {
    return this.issues.length > 0;
}

function clearIssues(predicate) {
    if (this.hasIssues()) {
        if (predicate && predicate instanceof Object) {
            MISC_DATA.get(this).set('issues', this.issues.filter(issue => {
                let condition = true;
                Object.keys(predicate).forEach(key => {
                    if (Object.getOwnPropertyDescriptor(Issue.prototype, key)) {
                        condition &= predicate[key] === issue[key];
                    }
                });
                return !condition;
            }));
        } else {
            this.resetIssues();
        }
        this.touch();
    }
    return this;
}

function resetIssues() {
    MISC_DATA.get(this).set('issues', []);
    this.touch();
    return this;
}

/**
 * Delete this entity
 */
function deleteEntity() {
    if (this.hasParent()) {
        this.parent.removeChild(this._id);
    } else {
        this.reset();
    }
}

/**
 * Reset this entity
 */
function resetEntity() {
    ID.set(this, Math.random().toString(36).slice(2));
    this.removeLocation();
    CONFIG.set(this, new Map());
    METADATA.set(this, new Map());
    ENRICHERS.set(this, new Map());
    POLICIES.set(this, new Map());
    CHILDREN.set(this, new Array());
    MISC_DATA.set(this, new Map());
    MISC_DATA.get(this).set('issues', []);
    this.family = EntityFamily.ENTITY.id;
    this.touch();
}

function isDslish(x) {
    if (typeof x === 'string' && x.startsWith('$brooklyn:')) return true;
}

/**
 * Set entity from JSON object
 * @param {{}} incomingModel
 * @param {boolean} setChildren
 * @returns {Entity}
 */
function setEntityFromJson(incomingModel, setChildren = true) {
    // ideally we'd be able to detect the type of `incomingModel`; 
    // imagine we had `DslExpression` as a type and a `DslEntitySpecExpression` as a subclass of `DslExpression`, then:
    // * this code should throw an error if it's not-null, not undefined, but not a `DslExpression`.  
    // * the UI should then render it differently whether it is a `DslEntitySpecExpression` or not.
    // but for now we have the isDslish hack, and the UI renders it based on a REPLACED_DSL_ENTITYSPEC marker
    if (incomingModel && incomingModel.constructor.name !== 'Object') {
        if (isDslish(incomingModel)) {
            // no error
        } else {
            throw new TypeError('Entity cannot be set from [' + incomingModel.constructor.name + '] ... please supply an [Object]');
        }
    }
    METADATA.get(this).clear();
    return Object.keys(incomingModel).reduce((self, key)=> {
        if (UNSUPPORTED_CATALOG_FIELDS.indexOf(key) !== -1) {
            throw new Error('Catalog format not supported ... unsupported field [' + key + ']');
        }
        if (Object.keys(UNSUPPORTED_FIELDS).indexOf(key) !== -1) {
            throw new Error(`Field [${key}] not supported ... ${UNSUPPORTED_FIELDS[key]}`);
        }
        switch (key) {
            case FIELD.CHILDREN:
            case FIELD.SERVICES:
                if (setChildren) {
                    self.setChildrenFromJson(incomingModel[key]);
                }
                break;
            case FIELD.CONFIG:
                self.setConfigFromJson(incomingModel[key]);
                break;
            case FIELD.ENRICHERS:
                self.setEnrichersFromJson(incomingModel[key]);
                break;
            case FIELD.POLICIES:
                self.setPoliciesFromJson(incomingModel[key]);
                break;
            case FIELD.LOCATION:
                this.location = incomingModel[key];
                break;
            case FIELD.TYPE:
                let parsedType = incomingModel[key].split(':');
                self.addMetadata(key, parsedType[0]);
                self.miscData.delete('version');
                if (parsedType.length > 1) {
                    self.miscData.set('version', parsedType[1]);
                }
                break;
            // This field is use to pass back information about a virtual item. A virtual item is an item that is not present
            // within the Brooklyn Catalog but translate to a real blueprint. As the composer is bidirectional, it requires
            // at least the virtual type that will replace the real type within the internal model. The composer will then
            // use its standard routines to get back the rest of the information. This needs to be used in concert with a
            // customised PaletteApiProvider implementation to get back the information about the virtual item.
            case FIELD.COMPOSER_META:
                let composerMetadata = incomingModel[key];
                if (composerMetadata.hasOwnProperty('virtualType')) {
                    self.addMetadata(FIELD.TYPE, composerMetadata.virtualType);
                }
                break;
            default:
                self.addMetadata(key, incomingModel[key]);
        }
        return self;
    }, this);
}


/**
 * Set {Entity} childen from JSON {Array}
 * @param {Array} incomingModel
 */
function setChildrenFromJson(incomingModel) {
    if (!Array.isArray(incomingModel)) {
        throw new Error('Model parse error ... cannot add children as it must be an array')
    }
    var children = new Array();

    incomingModel.reduce((self, child)=> {
        var childEntity = new Entity();
        childEntity.setEntityFromJson(child);
        childEntity.parent = self;
        children.push(childEntity);
        return this;
    }, this);
    CHILDREN.set(this, children);
    this.touch();
}

/**
 * Set brooklyn.config from JSON
 * @param {{}} incomingModel
 */
function setConfigFromJson(incomingModel) {
    CONFIG.get(this).clear();
    var self = this;
    Object.keys(incomingModel).forEach((key)=>(self.addConfig(key, incomingModel[key])));
    this.touch();
}


function setMetadataFromJson(incomingModel) {
    METADATA.get(this).clear();
    var self = this;
    Object.keys(incomingModel).forEach((key)=> (self.addMetadata(key, incomingModel[key])));
    this.touch();
}

/**
 * Set {Entity} enrichers from JSON {Array}
 * @param {Array} incomingModel
 */
function setEnrichersFromJson(incomingModel) {
    if (!Array.isArray(incomingModel)) {
        throw new Error('Model parse error ... cannot add enrichers as it must be an array')
    }
    ENRICHERS.get(this).clear();
    let self = this;
    incomingModel.map((enricher)=> {
        let newEnricher = new Entity();
        newEnricher.setEntityFromJson(enricher);
        newEnricher.parent = self;
        self.addEnricher(newEnricher);
    });
    this.touch();
}

/**
 * Set {Entity} policies from JSON {Array}
 * @param {Array} incomingModel
 */
function setPoliciesFromJson(incomingModel) {
    if (!Array.isArray(incomingModel)) {
        throw new Error('Model parse error ... cannot add policies as it must be an array')
    }
    POLICIES.get(this).clear();
    let self = this;
    incomingModel.map((policy)=> {
        let newPolicy = new Entity();
        newPolicy.setEntityFromJson(policy);
        newPolicy.parent = self;
        self.addPolicy(newPolicy);
    });
    this.touch();
}

function getMetadataAsJson() {
    let metadata = cleanForJson(METADATA.get(this), -1);
    if (metadata.hasOwnProperty(FIELD.TYPE) && this.hasVersion()) {
        metadata[FIELD.TYPE] += ':' + this.version;
    }
    return metadata;
}

function getConfigAsJson() {
    return cleanForJson(CONFIG.get(this), -1);
}

/* "cleaning" here means:  Dsl objects are toStringed, to the given depth (or infinite if depth<0);
 * and entries in Map that are memberspec are unwrapped.
 * previously we also stringified maps/lists but that seemed pointless, and it was lossy and buggy.
 */
function cleanForJson(item, depth) {
    if (depth==0) {
        return item;
    }
    if (item instanceof Dsl) {
        // return the string value so that the json is accurate
        // (otherwise it goes through keys below, which is wrong)
        return item.toString();
    }
    if (item instanceof Map) {
        var result = {};
        for (var [key, value] of item) {
            if (ANY_MEMBERSPEC_REGEX.test(key) && value.hasOwnProperty(DSL.ENTITY_SPEC)) {
                var _jsonVal = {};
                _jsonVal[DSL.ENTITY_SPEC] = value[DSL.ENTITY_SPEC].getData();
                result[key] = _jsonVal;
            } else {
                result[key] = cleanForJson(value, depth-1);
            }
        }
        return result;
    }
    if (item instanceof Array) {
        return item.map(item2 => cleanForJson(item2, depth-1));
    }
    if (item instanceof Object) {
        return Object.keys(item).reduce((o, key) => {
            o[key] = cleanForJson(item[key], depth-1);
            return o;
        }, {});
    }
    return item;
}

/**
 * Performs a deep merge of objects and returns new object. Does not modify
 * objects (immutable) and merges arrays via concatenation.
 *
 * @param {...object} objects - Objects to merge
 * @returns {object} New object with merged key/values
 */
function deepMerge(...objects) {
    const isObject = obj => obj && typeof obj === 'object';

    if (objects.length === 1) {
        return objects[0];
    }

    return objects.reduce((acc, obj) => {
        if (obj === null || typeof obj === 'undefined') {
            return acc;
        }

        Object.keys(obj).forEach(key => {
            const currenValue = acc[key];
            const valueToMerge = obj[key];

            if (Array.isArray(currenValue) && Array.isArray(valueToMerge)) {
                acc[key] = currenValue.concat(...valueToMerge);
            }
            else if (isObject(currenValue) && isObject(valueToMerge)) {
                acc[key] = deepMerge(currenValue, valueToMerge);
            }
            else {
                acc[key] = valueToMerge;
            }
        });

        return acc;
    }, {});
}

export class EntityError extends Error {

    constructor(message, options = {}) {
        super(message);
        this.name = 'EntityError';
        this.message = message;
        this.id = options.id || 'general-error';
        this.data = options.data || null;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }
}