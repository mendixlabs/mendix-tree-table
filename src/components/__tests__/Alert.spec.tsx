import { createElement } from "react";
import { shallow } from "enzyme";

import { Alerts } from "../Alert";
import { ValidationMessage } from '@jeltemx/mendix-react-widget-utils/lib/validation';

describe("Alert", () => {
    it("renders the structure when an alert message is specified", () => {

        const text = "this is a text";
        const message = new ValidationMessage(text);
        const id = message.id;
        const alert = shallow(<Alerts validationMessages={[message]} />);

        expect(alert.equals(<ul className="alerts"><li key={id}><div className="alert alert-danger">{message}</div></li></ul>)).toEqual(true);
    });

    it("renders a list", () => {
        const texts = ["1", "2"];
        const messages = texts.map(t => new ValidationMessage(t));
        const alert = shallow(<Alerts validationMessages={messages} />);

        expect(
            alert.equals(
                <ul className="alerts">
                    <li key={messages[0].id}><div className="alert alert-danger">1</div></li>
                    <li key={messages[1].id}><div className="alert alert-danger">2</div></li>
                </ul>
            )
        ).toEqual(true);
    });

    it("renders no structure when the alert message is not specified", () => {
        const alert = shallow(<Alerts validationMessages={[]}  />);

        expect(alert.isEmptyRender()).toEqual(true);
    });
});
