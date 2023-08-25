import Component from "@glimmer/component";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import I18n from "I18n";
import { MAX_MESSAGE_LENGTH } from "discourse/models/post-action-type";
import { Promise } from "rsvp";
import User from "discourse/models/user";
import optionalService from "discourse/lib/optional-service";
import { classify } from "@ember/string";

export default class Flag extends Component {
  @service adminTools;
  @service currentUser;

  @tracked userDetails;
  @tracked selected;
  @tracked message;
  @tracked isWarning = false;
  @tracked spammerDetails;

  constructor() {
    super(...arguments);

    if (this.adminTools) {
      this.adminTools.checkSpammer(this.args.model.user_id).then((result) => {
        this.spammerDetails = result;
      });
    }
  }

  get flagActions() {
    return {
      icon: "gavel",
      label: I18n.t("flagging.take_action"),
      actions: [
        {
          id: "agree_and_keep",
          icon: "thumbs-up",
          label: I18n.t("flagging.take_action_options.default.title"),
          description: I18n.t("flagging.take_action_options.default.details"),
        },
        {
          id: "agree_and_suspend",
          icon: "ban",
          label: I18n.t("flagging.take_action_options.suspend.title"),
          description: I18n.t("flagging.take_action_options.suspend.details"),
          client_action: "suspend",
        },
        {
          id: "agree_and_silence",
          icon: "microphone-slash",
          label: I18n.t("flagging.take_action_options.silence.title"),
          description: I18n.t("flagging.take_action_options.silence.details"),
          client_action: "silence",
        },
      ],
    };
  }

  @action
  onKeydown(event) {
    // CTRL+ENTER or CMD+ENTER
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      if (this.submitEnabled) {
        this.createFlag();
        return false;
      }
    }
  }

  @action
  clientSuspend(performAction) {
    this.penalize("showSuspendModal", performAction);
  }

  @action
  clientSilence(performAction) {
    this.penalize("showSilenceModal", performAction);
  }

  @action
  async penalize(adminToolMethod, performAction) {
    if (this.adminTools) {
      const createdBy = await User.findByUsername(this.args.model.username);
      const opts = { before: performAction };

      if (this.args.model.flagTarget.editable()) {
        opts.postId = this.args.model.id;
        opts.postEdit = this.args.model.cooked;
      }

      return this.adminTools[adminToolMethod](createdBy, opts);
    }
  }

  @action
  deleteSpammer() {
    if (this.spammerDetails) {
      this.spammerDetails.deleteUser().then(() => window.location.reload());
    }
  }

  @action
  async takeAction(action) {
    const performAction = (o = {}) => {
      o.takeAction = true;
      this.createFlag(o);
      return Promise.resolve();
    };

    if (action.client_action) {
      const actionMethod = this[`client${classify(action.client_action)}`];
      if (actionMethod) {
        await actionMethod(() => performAction({ skipClose: true }));
      } else {
        console.error(`No handler for ${action.client_action} found`);
      }
    } else {
      this.args.model.setHidden();
      await performAction();
    }
  }

  @action
  createFlag(opts) {
    const params = opts || {};
    if (this.selected.is_custom_flag) {
      params.message = this.message;
    }
    this.args.model.flagTarget.create(this, params);
  }

  @action
  createFlagAsWarning() {
    this.createFlag({ isWarning: true });
    this.args.model.setHidden();
  }

  @action
  flagForReview() {
    if (!this.selected) {
      this.selected = this.notifyModeratorsFlag;
    }
    this.createFlag({ queue_for_review: true });
    this.args.model.setHidden();
  }

  @action
  changePostActionType(action) {
    this.selected = action;
  }

  @action
  canSendWarning() {
    return (
      !this.args.model.flagTarget.targetsTopic() &&
      this.currentUser.staff &&
      this.selected.name_key === "notify_user"
    );
  }
}
