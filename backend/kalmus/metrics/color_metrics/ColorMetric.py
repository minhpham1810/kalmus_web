from kalmus.utils.artist import compute_mean_color


class ColorMetric:
    color_metric_types = {}
    """
    Contains references to every color metric class
    String identifiers used as keys
    """

    color_metric_type = "none"

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if cls.color_metric_type != "none":
            cls.color_metric_types[cls.color_metric_type] = cls
            print(f"Registered Color Metric: {cls.color_metric_type}")

    @classmethod
    def get_color(cls, frame):
        """
        Finds the color using the color metric type

        :param frame: The input frame
        :type frame: np.ndarray
        :return: The color
        :rtype: np.ndarray
        """
        return compute_mean_color(frame)
