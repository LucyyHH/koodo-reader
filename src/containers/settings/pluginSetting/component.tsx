import React from "react";
import { SettingInfoProps, SettingInfoState } from "./interface";
import { Trans } from "react-i18next";
import _ from "underscore";
import { themeList } from "../../../constants/themeList";
import toast from "react-hot-toast";
import {
  checkPlugin,
  getWebsiteUrl,
  handleContextMenu,
  openExternalUrl,
} from "../../../utils/common";
import { getStorageLocation } from "../../../utils/common";
import DatabaseService from "../../../utils/storage/databaseService";
import { ConfigService } from "../../../assets/lib/kookit-extra-browser.min";
import { isElectron } from "react-device-detect";
declare var global: any;
class SettingDialog extends React.Component<
  SettingInfoProps,
  SettingInfoState
> {
  constructor(props: SettingInfoProps) {
    super(props);
    this.state = {
      isPreventTrigger:
        ConfigService.getReaderConfig("isPreventTrigger") === "yes",
      isPreventAdd: ConfigService.getReaderConfig("isPreventAdd") === "yes",
      isOpenBook: ConfigService.getReaderConfig("isOpenBook") === "yes",
      isDisablePopup: ConfigService.getReaderConfig("isDisablePopup") === "yes",
      isDeleteShelfBook:
        ConfigService.getReaderConfig("isDeleteShelfBook") === "yes",
      isHideShelfBook:
        ConfigService.getReaderConfig("isHideShelfBook") === "yes",
      isOpenInMain: ConfigService.getReaderConfig("isOpenInMain") === "yes",
      isPrecacheBook: ConfigService.getReaderConfig("isPrecacheBook") === "yes",
      appSkin: ConfigService.getReaderConfig("appSkin"),
      isUseBuiltIn: ConfigService.getReaderConfig("isUseBuiltIn") === "yes",
      isDisablePDFCover:
        ConfigService.getReaderConfig("isDisablePDFCover") === "yes",
      currentThemeIndex: _.findLastIndex(themeList, {
        name: ConfigService.getReaderConfig("themeColor"),
      }),
      storageLocation: getStorageLocation() || "",
      isAddNew: false,
      settingLogin: "",
      driveConfig: {},
      loginConfig: {},
      customAIUrl: ConfigService.getReaderConfig("customAIUrl") || "",
      customAIKey: ConfigService.getReaderConfig("customAIKey") || "",
      customAIModel: ConfigService.getReaderConfig("customAIModel") || "gpt-3.5-turbo",
      isTestingAI: false,
      isHideLogin: ConfigService.getReaderConfig("isHideLogin") === "yes",
    };
  }

  handleRest = (_bool: boolean) => {
    toast.success(this.props.t("Change successful"));
  };
  handleSetting = (stateName: string) => {
    this.setState({ [stateName]: !this.state[stateName] } as any);
    ConfigService.setReaderConfig(
      stateName,
      this.state[stateName] ? "no" : "yes"
    );
    this.handleRest(this.state[stateName]);
  };
  handleSaveCustomAI = () => {
    ConfigService.setReaderConfig("customAIUrl", this.state.customAIUrl);
    ConfigService.setReaderConfig("customAIKey", this.state.customAIKey);
    ConfigService.setReaderConfig("customAIModel", this.state.customAIModel);
    this.props.handleFetchPlugins();
    toast.success(this.props.t("Change successful"));
  };
  handleTestCustomAI = async () => {
    if (!this.state.customAIUrl || !this.state.customAIKey) {
      toast.error(this.props.t("Please fill in all required fields"));
      return;
    }
    this.setState({ isTestingAI: true });
    try {
      const response = await fetch(`${this.state.customAIUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.state.customAIKey}`,
        },
        body: JSON.stringify({
          model: this.state.customAIModel || "gpt-3.5-turbo",
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 5,
        }),
      });
      if (response.ok) {
        toast.success(this.props.t("Connection successful"));
      } else {
        toast.error(this.props.t("Connection failed") + `: ${response.status}`);
      }
    } catch (error) {
      toast.error(
        this.props.t("Connection failed") +
          ": " +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      this.setState({ isTestingAI: false });
    }
  };
  handleClearCustomAI = () => {
    ConfigService.setReaderConfig("customAIUrl", "");
    ConfigService.setReaderConfig("customAIKey", "");
    ConfigService.setReaderConfig("customAIModel", "");
    this.setState({
      customAIUrl: "",
      customAIKey: "",
      customAIModel: "gpt-3.5-turbo",
    });
    this.props.handleFetchPlugins();
    toast.success(this.props.t("Clear successful"));
  };
  render() {
    return (
      <>
        {/* 自定义AI配置区域 */}
        <div className="setting-dialog-new-title" style={{ fontWeight: "bold", marginBottom: "10px" }}>
          <Trans>Custom AI Service</Trans>
        </div>
        <p className="setting-option-subtitle" style={{ marginBottom: "15px" }}>
          <Trans>Configure your own OpenAI-compatible API to use AI features without login</Trans>
        </p>
        
        <div className="setting-dialog-new-title" style={{ alignItems: "center" }}>
          <span style={{ width: "100px" }}>API URL</span>
          <input
            type="text"
            className="token-dialog-token-box"
            style={{ width: "calc(100% - 120px)", marginLeft: "10px", height: "32px", padding: "4px 8px" }}
            placeholder="https://api.openai.com/v1"
            value={this.state.customAIUrl}
            onChange={(e) => this.setState({ customAIUrl: e.target.value })}
            onContextMenu={() => handleContextMenu("custom-ai-url")}
            id="custom-ai-url"
          />
        </div>
        <p className="setting-option-subtitle">
          <Trans>OpenAI-compatible API endpoint, e.g. https://api.openai.com/v1</Trans>
        </p>

        <div className="setting-dialog-new-title" style={{ alignItems: "center" }}>
          <span style={{ width: "100px" }}>API Key</span>
          <input
            type="password"
            className="token-dialog-token-box"
            style={{ width: "calc(100% - 120px)", marginLeft: "10px", height: "32px", padding: "4px 8px" }}
            placeholder="sk-xxxxxxxxxxxxxxxx"
            value={this.state.customAIKey}
            onChange={(e) => this.setState({ customAIKey: e.target.value })}
            onContextMenu={() => handleContextMenu("custom-ai-key")}
            id="custom-ai-key"
          />
        </div>
        <p className="setting-option-subtitle">
          <Trans>Your API key for authentication</Trans>
        </p>

        <div className="setting-dialog-new-title" style={{ alignItems: "center" }}>
          <span style={{ width: "100px" }}><Trans>Model</Trans></span>
          <input
            type="text"
            className="token-dialog-token-box"
            style={{ width: "calc(100% - 120px)", marginLeft: "10px", height: "32px", padding: "4px 8px" }}
            placeholder="gpt-3.5-turbo"
            value={this.state.customAIModel}
            onChange={(e) => this.setState({ customAIModel: e.target.value })}
            onContextMenu={() => handleContextMenu("custom-ai-model")}
            id="custom-ai-model"
          />
        </div>
        <p className="setting-option-subtitle">
          <Trans>Model name, e.g. gpt-3.5-turbo, gpt-4, claude-3-sonnet, etc.</Trans>
        </p>

        <div className="setting-dialog-new-title" style={{ justifyContent: "flex-end", marginBottom: "20px" }}>
          <span
            className="change-location-button"
            style={{ marginRight: "10px" }}
            onClick={() => this.handleClearCustomAI()}
          >
            <Trans>Clear</Trans>
          </span>
          <span
            className="change-location-button"
            style={{ marginRight: "10px" }}
            onClick={() => this.handleTestCustomAI()}
          >
            {this.state.isTestingAI ? <Trans>Testing...</Trans> : <Trans>Test</Trans>}
          </span>
          <span
            className="change-location-button"
            onClick={() => this.handleSaveCustomAI()}
          >
            <Trans>Confirm</Trans>
          </span>
        </div>

        <div style={{ borderBottom: "1px solid #e0e0e0", margin: "20px 0" }}></div>

        {/* 隐藏登录功能 */}
        <div className="setting-dialog-new-title">
          <span style={{ width: "calc(100% - 100px)" }}>
            <Trans>Hide login feature</Trans>
          </span>
          <span
            className="single-control-switch"
            onClick={() => {
              const newValue = !this.state.isHideLogin;
              this.setState({ isHideLogin: newValue });
              ConfigService.setReaderConfig("isHideLogin", newValue ? "yes" : "no");
              this.props.handleFetchPlugins();
              toast.success(this.props.t("Change successful"));
            }}
            style={this.state.isHideLogin ? {} : { opacity: 0.6 }}
          >
            <span
              className="single-control-button"
              style={
                this.state.isHideLogin
                  ? {
                      transform: "translateX(20px)",
                      transition: "transform 0.5s ease",
                    }
                  : {
                      transform: "translateX(0px)",
                      transition: "transform 0.5s ease",
                    }
              }
            ></span>
          </span>
        </div>
        <p className="setting-option-subtitle">
          <Trans>Hide login button and account features, all features will work without login</Trans>
        </p>

        <div style={{ borderBottom: "1px solid #e0e0e0", margin: "20px 0" }}></div>

        {/* 插件列表区域 */}
        {this.props.plugins &&
          (this.props.plugins.length === 0 || this.state.isAddNew) && (
            <div
              className="voice-add-new-container"
              style={{
                marginLeft: "25px",
                width: "calc(100% - 50px)",
                fontWeight: 500,
              }}
            >
              <textarea
                name="url"
                placeholder={this.props.t(
                  "Paste the code of the plugin here, check out document to learn how to get more plugins"
                )}
                id="voice-add-content-box"
                className="voice-add-content-box"
                onContextMenu={() => {
                  handleContextMenu("voice-add-content-box");
                }}
              />
              <div className="token-dialog-button-container">
                <div
                  className="voice-add-confirm"
                  onClick={async () => {
                    let value: string = (
                      document.querySelector(
                        "#voice-add-content-box"
                      ) as HTMLTextAreaElement
                    ).value;
                    if (value) {
                      let plugin = JSON.parse(value);
                      plugin.key = plugin.identifier;
                      if (!(await checkPlugin(plugin))) {
                        toast.error(this.props.t("Plugin verification failed"));
                        return;
                      }
                      if (plugin.type === "voice" && !isElectron) {
                        toast.error(
                          this.props.t(
                            "Only desktop version supports TTS plugin"
                          )
                        );
                        return;
                      }
                      if (
                        plugin.type === "voice" &&
                        plugin.voiceList.length === 0
                      ) {
                        let voiceFunc = plugin.script;
                        // eslint-disable-next-line no-eval
                        eval(voiceFunc);
                        plugin.voiceList = await global.getTTSVoice(
                          plugin.config
                        );
                      }
                      if (
                        this.props.plugins.find(
                          (item) => item.key === plugin.key
                        )
                      ) {
                        await DatabaseService.updateRecord(plugin, "plugins");
                      } else {
                        await DatabaseService.saveRecord(plugin, "plugins");
                      }
                      this.props.handleFetchPlugins();
                      toast.success(this.props.t("Addition successful"));
                    }
                    this.setState({ isAddNew: false });
                  }}
                >
                  <Trans>Confirm</Trans>
                </div>
                <div className="voice-add-button-container">
                  <div
                    className="voice-add-cancel"
                    onClick={() => {
                      this.setState({ isAddNew: false });
                    }}
                  >
                    <Trans>Cancel</Trans>
                  </div>
                  <div
                    className="voice-add-cancel"
                    style={{ marginRight: "10px" }}
                    onClick={() => {
                      if (
                        ConfigService.getReaderConfig("lang") &&
                        ConfigService.getReaderConfig("lang").startsWith("zh")
                      ) {
                        openExternalUrl(getWebsiteUrl() + "/zh/plugin");
                      } else {
                        openExternalUrl(getWebsiteUrl() + "/en/plugin");
                      }
                    }}
                  >
                    <Trans>Document</Trans>
                  </div>
                </div>
              </div>
            </div>
          )}
        {this.props.plugins &&
          this.props.plugins.map((item) => {
            return (
              <div className="setting-dialog-new-title" key={item.key}>
                <span>
                  <span
                    className={`icon-${
                      item.type === "dictionary"
                        ? "dict"
                        : item.type === "voice"
                        ? "speaker"
                        : item.type === "translation"
                        ? "translation"
                        : "ai-assist"
                    } setting-plugin-icon`}
                  ></span>
                  <span className="setting-plugin-name">
                    {this.props.t(item.displayName)}
                  </span>
                </span>

                {!item.key.startsWith("official") && !item.key.startsWith("custom-ai") && (
                  <span
                    className="change-location-button"
                    onClick={async () => {
                      await DatabaseService.deleteRecord(item.key, "plugins");
                      this.props.handleFetchPlugins();
                      toast.success(this.props.t("Deletion successful"));
                    }}
                  >
                    <Trans>Delete</Trans>
                  </span>
                )}
              </div>
            );
          })}

        {this.props.plugins && this.props.plugins.length > 0 && (
          <div
            className="setting-dialog-new-plugin"
            style={{ fontWeight: "bold" }}
            onClick={async () => {
              this.setState({ isAddNew: true });
            }}
          >
            <Trans>Add new plugin</Trans>
          </div>
        )}
      </>
    );
  }
}

export default SettingDialog;
