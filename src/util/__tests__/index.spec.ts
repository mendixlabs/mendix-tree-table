import { createCamelcaseId, getReferencePart } from "..";

describe("Utils", () => {
    it("should create the right IDs", () => {
        const camel1 = createCamelcaseId("TestingAll");
        const camel2 = createCamelcaseId("id");
        const camel3 = createCamelcaseId("key");

        expect(camel1).toEqual("testingall");
        expect(camel2).toEqual("idId");
        expect(camel3).toEqual("keyId");

    });

    it("should create the right references", () => {
        const ref = getReferencePart("11111/22222");
        const entity = getReferencePart("11111/22222", "entity");

        expect(ref).toEqual("11111");
        expect(entity).toEqual("22222");
    });
})
